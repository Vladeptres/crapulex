# Multi-stage build for better performance and smaller image
FROM python:3.11-slim as builder

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies for building
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        libffi-dev \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv for faster Python package management
RUN pip install uv

# Set work directory
WORKDIR /app

# Copy dependency files first (for better layer caching)
COPY ../pyproject.toml ../uv.lock* ./
COPY ../README.md ./README.md
COPY ../chat_analyser-0.1.0-py3-none-any.whl ./chat_analyser-0.1.0-py3-none-any.whl

# Install Python dependencies
RUN uv sync --frozen --no-dev

# Production stage
FROM python:3.11-slim as production

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV ENVIRONNEMENT_NAME=$ENVIRONNEMENT_NAME

# Install only runtime dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libffi8 \
        libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -ms /bin/bash appuser

# Set work directory
WORKDIR /app

# Copy virtual environment from builder stage
COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv

# Copy application code
COPY --chown=appuser:appuser . /app/

# Copy and make entrypoint script executable
COPY --chown=appuser:appuser docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create media directory
RUN mkdir -p media_files && chown appuser:appuser media_files

# Switch to non-root user
USER appuser

# Expose port
EXPOSE $API_PORT

# Use entrypoint script to handle environment variables properly
CMD ["/app/entrypoint.sh"]
