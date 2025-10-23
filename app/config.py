# app/config.py

import os
from dotenv import load_dotenv

# -- English Comments for Logic --

# Get the project's root directory.
# We determine the location of this file (__file__) and go up two levels
# (from app/config.py to the project root).
# This makes all paths robust and independent of where the script is run.
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# Load environment variables from the .env file located in the project root.
dotenv_path = os.path.join(PROJECT_ROOT, '.env')
load_dotenv(dotenv_path)

# --- Application Configuration ---

# Server settings
# Get the PORT from .env, with a default of 8888 if not found.
PORT = int(os.getenv('PORT', '8888'))
# Get the HOST from .env, with a default of 127.0.0.1.
HOST = os.getenv('HOST', '127.0.0.1')

# Debug mode setting. Default is False.
# We check if the value is 'True' (case-insensitive) to get a boolean.
# This allows you to set DEBUG=True in your .env file to enable debug mode.
DEBUG = os.getenv('DEBUG', 'False').lower() in ('true', '1', 't')

# Database settings
# Get the full database connection URL from .env.
DATABASE_URL = os.getenv("DB_URL")
if not DATABASE_URL:
    # If the database URL is not set, we raise an error to prevent the app
    # from running without a database connection.
    raise ValueError("DB_URL is not set in the .env file!")

# Path settings
# Define absolute paths to static, template, and log folders using PROJECT_ROOT.
# This is the single source of truth for all paths in the application.
STATIC_PATH = os.path.join(PROJECT_ROOT, 'static')
TEMPLATE_PATH = os.path.join(PROJECT_ROOT, 'templates')
LOGS_PATH = os.path.join(PROJECT_ROOT, 'logs')

# --- NEW: URL prefix for static files ---
# This is the prefix used in the browser to request static assets.
STATIC_URL_PREFIX = '/static/'