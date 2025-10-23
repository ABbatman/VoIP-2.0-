from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi import Request
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv

from app.routers.metrics import router as metrics_router
from app.routers.jobs import router as jobs_router
from app.routers.suggest import router as suggest_router
from app.utils.telemetry import init_otel
from app.db.base import async_engine


# Load .env for REDIS_URL etc.
load_dotenv()

app = FastAPI(
    title="Metrics API",
    description="Async API for fetching and managing call metrics",
    version="1.0.0",
)
app.include_router(metrics_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(suggest_router, prefix="/api")

# Serve built static assets and mount root page
app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")


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


