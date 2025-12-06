"""
Monitoring utilities for Django backend including metrics, logging, and health checks.
"""

import os
import threading
import time
from datetime import UTC, datetime
from typing import Any

import psutil
from django.http import HttpRequest, HttpResponse
from django.utils.deprecation import MiddlewareMixin
from loguru import logger


class MetricsCollector:
    """Thread-safe metrics collector for application monitoring."""

    def __init__(self):
        self._lock = threading.Lock()
        self._metrics = {
            "requests_total": 0,
            "requests_by_method": {},
            "requests_by_status": {},
            "response_times": [],
            "active_connections": 0,
            "errors_total": 0,
            "database_queries": 0,
            "cache_hits": 0,
            "cache_misses": 0,
        }
        self._start_time = time.time()

    def increment_counter(self, metric: str, labels: dict[str, str] | None = None):
        """Increment a counter metric."""
        with self._lock:
            if labels:
                key = f"{metric}_{labels}"
                self._metrics.setdefault(key, 0)
                self._metrics[key] += 1
            else:
                self._metrics.setdefault(metric, 0)
                self._metrics[metric] += 1

    def record_histogram(self, metric: str, value: float):
        """Record a histogram value."""
        with self._lock:
            self._metrics.setdefault(metric, [])
            self._metrics[metric].append(value)
            # Keep only last 1000 values to prevent memory issues
            if len(self._metrics[metric]) > 1000:
                self._metrics[metric] = self._metrics[metric][-1000:]

    def get_metrics(self) -> dict[str, Any]:
        """Get current metrics snapshot."""
        with self._lock:
            metrics = self._metrics.copy()

        # Calculate derived metrics
        uptime = time.time() - self._start_time

        # Calculate response time statistics
        response_times = metrics.get("response_times", [])
        if response_times:
            avg_response_time = sum(response_times) / len(response_times)
            p95_response_time = (
                sorted(response_times)[int(len(response_times) * 0.95)] if len(response_times) > 0 else 0
            )
        else:
            avg_response_time = 0
            p95_response_time = 0

        return {
            "uptime_seconds": uptime,
            "requests_total": metrics.get("requests_total", 0),
            "requests_per_second": metrics.get("requests_total", 0) / uptime if uptime > 0 else 0,
            "avg_response_time_ms": avg_response_time * 1000,
            "p95_response_time_ms": p95_response_time * 1000,
            "active_connections": metrics.get("active_connections", 0),
            "errors_total": metrics.get("errors_total", 0),
            "error_rate": metrics.get("errors_total", 0) / max(metrics.get("requests_total", 1), 1),
            "requests_by_method": {
                k.replace("requests_by_method_", ""): v
                for k, v in metrics.items()
                if k.startswith("requests_by_method_")
            },
            "requests_by_status": {
                k.replace("requests_by_status_", ""): v
                for k, v in metrics.items()
                if k.startswith("requests_by_status_")
            },
            "database_queries": metrics.get("database_queries", 0),
            "cache_hits": metrics.get("cache_hits", 0),
            "cache_misses": metrics.get("cache_misses", 0),
            "cache_hit_rate": metrics.get("cache_hits", 0)
            / max(metrics.get("cache_hits", 0) + metrics.get("cache_misses", 0), 1),
        }


# Global metrics collector instance
metrics_collector = MetricsCollector()


class MonitoringMiddleware(MiddlewareMixin):
    """Django middleware for monitoring requests and responses."""

    def process_request(self, request: HttpRequest):
        """Process incoming request."""
        request._monitoring_start_time = time.time()

        # Increment active connections
        metrics_collector.increment_counter("active_connections")

        # Log request details
        logger.info(
            "Request started",
            method=request.method,
            path=request.path,
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            remote_addr=self._get_client_ip(request),
            request_timestamp=datetime.now(UTC).isoformat(),
        )

    def process_response(self, request: HttpRequest, response: HttpResponse):
        """Process outgoing response."""
        # Calculate response time
        start_time = getattr(request, "_monitoring_start_time", time.time())
        response_time = time.time() - start_time

        # Update metrics
        metrics_collector.increment_counter("requests_total")
        metrics_collector.increment_counter("requests_by_method", {"method": request.method})
        metrics_collector.increment_counter("requests_by_status", {"status": str(response.status_code)})
        metrics_collector.record_histogram("response_times", response_time)

        # Decrement active connections
        metrics_collector._metrics["active_connections"] = max(
            0,
            metrics_collector._metrics.get("active_connections", 1) - 1,
        )

        # Track errors
        if response.status_code >= 400:
            metrics_collector.increment_counter("errors_total")

        # Log response details
        logger.info(
            "Request completed",
            method=request.method,
            path=request.path,
            status_code=response.status_code,
            response_time_ms=response_time * 1000,
            content_length=len(response.content) if hasattr(response, "content") else 0,
            response_timestamp=datetime.now(UTC).isoformat(),
        )

        return response

    def process_exception(self, request: HttpRequest, exception: Exception):
        """Process unhandled exceptions."""
        # Calculate response time
        start_time = getattr(request, "_monitoring_start_time", time.time())
        response_time = time.time() - start_time

        # Update error metrics
        metrics_collector.increment_counter("errors_total")
        metrics_collector.increment_counter("requests_by_status", {"status": "500"})

        # Decrement active connections
        metrics_collector._metrics["active_connections"] = max(
            0,
            metrics_collector._metrics.get("active_connections", 1) - 1,
        )

        # Log exception details
        logger.error(
            "Request failed with exception",
            method=request.method,
            path=request.path,
            exception_type=type(exception).__name__,
            exception_message=str(exception),
            response_time_ms=response_time * 1000,
            exception_timestamp=datetime.now(UTC).isoformat(),
        )

    def _get_client_ip(self, request: HttpRequest) -> str:
        """Get client IP address from request."""
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            ip = x_forwarded_for.split(",")[0]
        else:
            ip = request.META.get("REMOTE_ADDR")
        return ip or "unknown"


class HealthChecker:
    """Health check utilities for monitoring system status."""

    @staticmethod
    def check_database() -> dict[str, Any]:
        """Check database connectivity and performance."""
        try:
            from django.db import connection

            start_time = time.time()

            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()

            response_time = time.time() - start_time

            return {
                "status": "healthy",
                "response_time_ms": response_time * 1000,
                "details": "Database connection successful",
            }
        except Exception as e:
            return {"status": "unhealthy", "error": str(e), "details": "Database connection failed"}

    @staticmethod
    def check_redis() -> dict[str, Any]:
        """Check Redis connectivity and performance."""
        try:
            from core.config import get_redis_client

            start_time = time.time()
            redis_client = get_redis_client()
            redis_client.ping()
            response_time = time.time() - start_time

            # Get Redis info
            info = redis_client.info()

            return {
                "status": "healthy",
                "response_time_ms": response_time * 1000,
                "details": {
                    "connected_clients": info.get("connected_clients", 0),
                    "used_memory_human": info.get("used_memory_human", "unknown"),
                    "uptime_in_seconds": info.get("uptime_in_seconds", 0),
                },
            }
        except Exception as e:
            return {"status": "unhealthy", "error": str(e), "details": "Redis connection failed"}

    @staticmethod
    def check_mongodb() -> dict[str, Any]:
        """Check MongoDB connectivity and performance."""
        try:
            from core.config import get_mongo_client

            start_time = time.time()
            mongo_client = get_mongo_client()

            # Ping MongoDB
            mongo_client.admin.command("ping")
            response_time = time.time() - start_time

            # Get server status
            server_status = mongo_client.admin.command("serverStatus")

            return {
                "status": "healthy",
                "response_time_ms": response_time * 1000,
                "details": {
                    "version": server_status.get("version", "unknown"),
                    "uptime": server_status.get("uptime", 0),
                    "connections": server_status.get("connections", {}).get("current", 0),
                },
            }
        except Exception as e:
            return {"status": "unhealthy", "error": str(e), "details": "MongoDB connection failed"}

    @staticmethod
    def get_system_health() -> dict[str, Any]:
        """Get overall system health status."""

        # CPU and memory usage
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage("/")

        # Process info
        process = psutil.Process(os.getpid())
        process_memory = process.memory_info()

        return {
            "cpu_percent": cpu_percent,
            "memory": {
                "total": memory.total,
                "available": memory.available,
                "percent": memory.percent,
                "used": memory.used,
            },
            "disk": {
                "total": disk.total,
                "used": disk.used,
                "free": disk.free,
                "percent": (disk.used / disk.total) * 100,
            },
            "process": {
                "pid": os.getpid(),
                "memory_rss": process_memory.rss,
                "memory_vms": process_memory.vms,
                "cpu_percent": process.cpu_percent(),
                "num_threads": process.num_threads(),
            },
        }
