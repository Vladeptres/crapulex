#!/bin/bash

# Use API_PORT environment variable, default to 8000 if not set
PORT=${API_PORT:-8000}

# Start the Django application with Daphne
exec /app/.venv/bin/daphne -b 0.0.0.0 -p $PORT api.asgi:application
