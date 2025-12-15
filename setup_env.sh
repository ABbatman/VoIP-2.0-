#!/bin/bash
# setup_env.sh - Environment setup script for VoIP application
# Usage: bash setup_env.sh

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"

echo "=== VoIP Environment Setup ==="
echo "Project directory: $SCRIPT_DIR"

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1)
echo "Python version: $PYTHON_VERSION"

# Create virtual environment if not exists
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
    echo "Virtual environment created."
else
    echo "Virtual environment already exists."
fi

# Activate virtual environment
echo "Activating virtual environment..."
source "$VENV_DIR/bin/activate"

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip --quiet

# Install dependencies
echo "Installing dependencies from requirements.txt..."
pip install -r "$SCRIPT_DIR/requirements.txt"

# Create .env from example if not exists
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    if [ -f "$SCRIPT_DIR/.env.example" ]; then
        echo "Creating .env from .env.example..."
        cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
        echo "Please edit .env with your production settings!"
    fi
fi

# Create logs directory
mkdir -p "$SCRIPT_DIR/logs"

echo ""
echo "=== Setup Complete ==="
echo "To activate the environment, run:"
echo "  source $VENV_DIR/bin/activate"
echo ""
echo "To start the application, run:"
echo "  bash start.sh"
