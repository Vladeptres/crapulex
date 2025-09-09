# Use Python 3.11 slim image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        libffi-dev \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv for faster Python package management
RUN pip install uv

# Create a non-root user first
RUN useradd -ms /bin/bash appuser

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Copy the root README.md file to satisfy pyproject.toml
COPY ./README.md ./README.md

# Change ownership of the app directory to appuser
RUN chown -R appuser:appuser /app

# Switch to non-root user before installing dependencies
USER appuser

# Install Python dependencies using uv
RUN uv sync --frozen --no-dev

# Copy project files (as appuser)
COPY --chown=appuser:appuser . .

# Create media directory
RUN mkdir -p media_files

# Expose port
EXPOSE 8000

# Run the application using uv
CMD ["uv", "run", "daphne", "-b", "0.0.0.0", "-p", "8000", "api.asgi:application"]
