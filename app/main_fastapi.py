from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi import Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import FileResponse

from app.routers.metrics import router as metrics_router
from app.routers.jobs import router as jobs_router
from app.routers.suggest import router as suggest_router
from app.routers.health import router as health_router
from app.routers.state import router as state_router
from app.utils.telemetry import init_otel
from app.db.base import async_engine
from app.middleware.rate_limiter import RateLimitMiddleware
from app.middleware.error_handler import ErrorHandlerMiddleware, setup_exception_handlers
from app import config

app = FastAPI(
    title="Metrics API",
    description="Async API for fetching and managing call metrics",
    version="1.0.0",
)

# Add middleware (order matters: first added = outermost)
# Error handler should be outermost to catch all errors
app.add_middleware(ErrorHandlerMiddleware, debug=config.DEBUG)
# Rate limiter protects from DDoS
app.add_middleware(RateLimitMiddleware, api_limit=60, general_limit=200)

# Register exception handlers
setup_exception_handlers(app)

# Include routers
app.include_router(health_router)  # Health checks at root level
app.include_router(metrics_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(suggest_router, prefix="/api")
app.include_router(state_router, prefix="/api")

# Serve built static assets and mount root page
app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Return empty response for favicon to prevent 404 errors."""
    from fastapi.responses import Response
    return Response(status_code=204)


@app.get("/")
async def root(request: Request):
    # Provide vite script tags to Jinja template
    from app.utils.vite import ViteLoader
    vite_tags = ViteLoader.instance().vite_script_tag()
    return templates.TemplateResponse("index.html", {"request": request, "vite_tags": vite_tags})


# Initialize OpenTelemetry after app is constructed
init_otel(app=app, engine=async_engine)


def get_app() -> FastAPI:
    return app


