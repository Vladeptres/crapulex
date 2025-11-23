"""
Structured logging configuration using loguru for better monitoring and debugging.
"""

import os
import sys
from datetime import datetime

from loguru import logger


def setup_logging():
    """Configure structured logging with loguru."""

    # Remove default handler
    logger.remove()

    # Get log level from environment
    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()

    # Console logging with structured format
    console_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
        "<level>{message}</level>"
    )

    logger.add(sys.stdout, format=console_format, level=log_level, colorize=True, backtrace=True, diagnose=True)

    # File logging with JSON format for structured logs
    log_dir = "/app/logs" if os.path.exists("/app") else "./logs"
    try:
        os.makedirs(log_dir, exist_ok=True)
        # Test write permissions
        test_file = os.path.join(log_dir, "test_permissions")
        with open(test_file, "w") as f:
            f.write("test")
        os.remove(test_file)
    except (OSError, PermissionError):
        # Fallback to a writable directory
        log_dir = "/tmp/logs"
        os.makedirs(log_dir, exist_ok=True)

    # Application logs
    logger.add(
        f"{log_dir}/bourracho-app.log",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level} | {name}:{function}:{line} | {message}",
        level=log_level,
        rotation="100 MB",
        retention="30 days",
        compression="gz",
        backtrace=True,
        diagnose=True,
    )

    # JSON structured logs for monitoring systems
    logger.add(
        f"{log_dir}/bourracho-structured.jsonl",
        format=lambda record: format_json_log(record),
        level=log_level,
        rotation="100 MB",
        retention="30 days",
        compression="gz",
    )

    # Error-only logs
    logger.add(
        f"{log_dir}/bourracho-errors.log",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level} | {name}:{function}:{line} | {message}",
        level="ERROR",
        rotation="50 MB",
        retention="90 days",
        compression="gz",
        backtrace=True,
        diagnose=True,
    )

    # Performance logs (for slow queries, long response times, etc.)
    logger.add(
        f"{log_dir}/bourracho-performance.log",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {message}",
        filter=lambda record: record["extra"].get("log_type") == "performance",
        rotation="50 MB",
        retention="7 days",
        compression="gz",
    )

    logger.info("Logging system initialized", log_level=log_level, log_dir=log_dir)


def format_json_log(record):
    """Format log record as JSON for structured logging."""
    import json

    log_entry = {
        "timestamp": record["time"].isoformat(),
        "level": record["level"].name,
        "logger": record["name"],
        "function": record["function"],
        "line": record["line"],
        "message": record["message"],
        "module": record["module"],
        "process": {"id": record["process"].id, "name": record["process"].name},
        "thread": {"id": record["thread"].id, "name": record["thread"].name},
    }

    # Add extra fields if present
    if record["extra"]:
        log_entry["extra"] = record["extra"]

    # Add exception info if present
    if record["exception"]:
        log_entry["exception"] = {
            "type": record["exception"].type.__name__,
            "value": str(record["exception"].value),
            "traceback": record["exception"].traceback,
        }

    return json.dumps(log_entry)


def log_performance(operation: str, duration_ms: float, **kwargs):
    """Log performance metrics for monitoring."""
    logger.bind(log_type="performance").info(
        f"Performance: {operation}", operation=operation, duration_ms=duration_ms, **kwargs,
    )


def log_database_query(query: str, duration_ms: float, rows_affected: int = None):
    """Log database query performance."""
    log_performance(
        "database_query",
        duration_ms,
        query_type=query.split()[0].upper() if query else "UNKNOWN",
        duration_ms=duration_ms,
        rows_affected=rows_affected,
    )


def log_api_request(method: str, path: str, status_code: int, duration_ms: float, **kwargs):
    """Log API request details."""
    logger.info(
        f"API Request: {method} {path}",
        method=method,
        path=path,
        status_code=status_code,
        duration_ms=duration_ms,
        **kwargs,
    )


def log_business_event(event_type: str, **kwargs):
    """Log business events for analytics and monitoring."""
    logger.info(
        f"Business Event: {event_type}", event_type=event_type, timestamp=datetime.utcnow().isoformat(), **kwargs,
    )


# Custom log filters
def filter_sensitive_data(record):
    """Filter out sensitive data from logs."""
    sensitive_keys = ["password", "token", "secret", "key", "auth"]

    if record["extra"]:
        for key in list(record["extra"].keys()):
            if any(sensitive in key.lower() for sensitive in sensitive_keys):
                record["extra"][key] = "[REDACTED]"

    # Also filter message content
    message = record["message"]
    for sensitive in sensitive_keys:
        if sensitive in message.lower():
            # Simple redaction - in production, use more sophisticated methods
            import re

            pattern = rf'{sensitive}["\s]*[:=]["\s]*[^"\s,}}\]]+["\s]*'
            message = re.sub(pattern, f'{sensitive}="[REDACTED]"', message, flags=re.IGNORECASE)

    record["message"] = message
    return True
