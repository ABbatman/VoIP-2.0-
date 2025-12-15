#!/bin/bash
# start.sh - Manual application startup script
# Usage: bash start.sh [tornado|fastapi]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"

# Mode: tornado (default) or fastapi
MODE="${1:-tornado}"

# Activate virtual environment
if [ -f "$VENV_DIR/bin/activate" ]; then
    source "$VENV_DIR/bin/activate"
else
    echo "Error: Virtual environment not found at $VENV_DIR"
    echo "Run 'bash setup_env.sh' first."
    exit 1
fi

# Load environment variables
if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi

cd "$SCRIPT_DIR"

echo "Starting VoIP application (mode: $MODE)..."

case "$MODE" in
    tornado)
        # Original Tornado server
        exec python -m app.main
        ;;
    fastapi)
        # FastAPI with Uvicorn
        exec uvicorn app.main_fastapi:app --host "${HOST:-127.0.0.1}" --port "${PORT:-8888}"
        ;;
    gunicorn)
        # Production: Gunicorn with Uvicorn workers
        exec gunicorn app.main_fastapi:app \
            --bind "${HOST:-0.0.0.0}:${PORT:-8888}" \
            --workers 4 \
            --worker-class uvicorn.workers.UvicornWorker \
            --access-logfile "$SCRIPT_DIR/logs/access.log" \
            --error-logfile "$SCRIPT_DIR/logs/error.log"
        ;;
    *)
        echo "Unknown mode: $MODE"
        echo "Usage: bash start.sh [tornado|fastapi|gunicorn]"
        exit 1
        ;;
esac
