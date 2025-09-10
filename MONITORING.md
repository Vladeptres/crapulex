# Bourracho Backend Monitoring Setup

This document describes the comprehensive monitoring solution implemented for the Bourracho Django backend API.

## Overview

The monitoring stack includes:
- **Application Metrics**: Custom Django middleware for request/response tracking
- **Health Checks**: Detailed health endpoints for all system components
- **Structured Logging**: JSON-formatted logs with loguru integration
- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization dashboards
- **Built-in Dashboard**: Simple HTML monitoring interface

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Django App    │───▶│   Prometheus    │───▶│    Grafana      │
│                 │    │                 │    │                 │
│ - Middleware    │    │ - Metrics       │    │ - Dashboards    │
│ - Health Checks │    │ - Scraping      │    │ - Alerts        │
│ - Structured    │    │ - Storage       │    │ - Visualization │
│   Logging       │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Quick Start

### 1. Start the Monitoring Stack

```bash
# Start all services including monitoring
docker compose up -d

# Check that all services are running
docker compose ps
```

### 2. Access Monitoring Interfaces

- **Built-in Dashboard**: http://localhost:8000/api/monitoring/
- **Grafana**: http://localhost:3001 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **Health Check**: http://localhost:8000/api/monitoring/health/

## Monitoring Endpoints

### Health Checks

| Endpoint | Description | Response Format |
|----------|-------------|-----------------|
| `/api/monitoring/health/` | Basic health check | JSON |
| `/api/monitoring/health/detailed/` | Detailed system health | JSON |

Example detailed health response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "service": "bourracho-backend",
  "checks": {
    "database": {"status": "healthy", "response_time_ms": 5.2},
    "redis": {"status": "healthy", "response_time_ms": 1.8},
    "mongodb": {"status": "healthy", "response_time_ms": 3.1},
    "system": {"status": "healthy", "details": {...}}
  }
}
```

### Metrics

| Endpoint | Description | Format |
|----------|-------------|--------|
| `/api/monitoring/metrics/` | Application metrics | JSON |
| `/api/monitoring/metrics/prometheus/` | Prometheus format | Text |

## Key Metrics Tracked

### Request Metrics
- **Total Requests**: `bourracho_requests_total`
- **Requests by Method**: `bourracho_requests_by_method_total`
- **Requests by Status**: `bourracho_requests_by_status_total`
- **Request Rate**: `bourracho_requests_per_second`

### Performance Metrics
- **Average Response Time**: `bourracho_response_time_avg_ms`
- **95th Percentile Response Time**: `bourracho_response_time_p95_ms`
- **Active Connections**: `bourracho_active_connections`

### Error Metrics
- **Total Errors**: `bourracho_errors_total`
- **Error Rate**: `bourracho_error_rate`

### System Metrics
- **Uptime**: `bourracho_uptime_seconds`
- **Database Queries**: `bourracho_database_queries_total`
- **Cache Hit Rate**: `bourracho_cache_hit_rate`

## Logging

### Log Levels and Files

The application uses structured logging with multiple output destinations:

```
/app/logs/
├── bourracho-app.log          # General application logs
├── bourracho-structured.jsonl # JSON structured logs
├── bourracho-errors.log       # Error-only logs
└── bourracho-performance.log  # Performance-specific logs
```

### Log Configuration

Set the log level via environment variable:
```bash
LOG_LEVEL=DEBUG  # DEBUG, INFO, WARNING, ERROR, CRITICAL
```

### Structured Log Format

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "INFO",
  "logger": "core.monitoring",
  "function": "process_request",
  "line": 45,
  "message": "Request started",
  "extra": {
    "method": "GET",
    "path": "/api/users/",
    "user_agent": "Mozilla/5.0...",
    "remote_addr": "192.168.1.100"
  }
}
```

## Grafana Dashboards

### Pre-configured Dashboard: "Bourracho Backend Monitoring"

The dashboard includes:
- **Request Rate**: Real-time request throughput
- **Response Time**: Average and 95th percentile response times
- **Error Rate**: Percentage of failed requests
- **Active Connections**: Current concurrent connections
- **HTTP Methods**: Distribution of request methods
- **Status Codes**: Distribution of response status codes

### Accessing Grafana

1. Open http://localhost:3001
2. Login with `admin` / `admin123`
3. Navigate to "Dashboards" → "Bourracho Backend Monitoring"

## Prometheus Configuration

### Scraping Configuration

Prometheus scrapes metrics from:
- Backend application: `backend:8000/api/monitoring/metrics/prometheus/`
- Health checks: `backend:8000/api/monitoring/health/detailed/`

### Data Retention

- Metrics are retained for 15 days
- Scraping interval: 30 seconds
- Health check interval: 60 seconds

## Environment Variables

### Monitoring Configuration

```bash
# Logging
LOG_LEVEL=INFO                    # Log level (DEBUG, INFO, WARNING, ERROR)

# Grafana
GRAFANA_ADMIN_USER=admin          # Grafana admin username
GRAFANA_ADMIN_PASSWORD=admin123   # Grafana admin password
```

## Production Considerations

### Security

1. **Change Default Credentials**:
   ```bash
   GRAFANA_ADMIN_PASSWORD=your-secure-password
   ```

2. **Restrict Access**: Configure firewall rules to limit access to monitoring ports:
   - Grafana (3001): Only admin networks
   - Prometheus (9090): Only internal networks

3. **Enable HTTPS**: Use reverse proxy (nginx) for SSL termination

### Performance

1. **Log Rotation**: Logs are automatically rotated and compressed
2. **Metrics Retention**: Adjust Prometheus retention based on storage capacity
3. **Resource Limits**: Set Docker resource limits for monitoring containers

### Alerting

Consider adding alerting rules for:
- High error rates (>5%)
- Slow response times (>1000ms)
- High memory usage (>80%)
- Service unavailability

Example Prometheus alerting rule:
```yaml
groups:
  - name: bourracho-alerts
    rules:
      - alert: HighErrorRate
        expr: bourracho_error_rate > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
```

## Troubleshooting

### Common Issues

1. **Metrics Not Appearing**:
   - Check Prometheus targets: http://localhost:9090/targets
   - Verify backend health: http://localhost:8000/api/monitoring/health/

2. **Grafana Dashboard Empty**:
   - Confirm Prometheus datasource is configured
   - Check Prometheus is scraping successfully

3. **High Memory Usage**:
   - Reduce metrics retention period
   - Increase log rotation frequency

### Debug Commands

```bash
# Check container logs
docker compose logs backend
docker compose logs prometheus
docker compose logs grafana

# Test health endpoints
curl http://localhost:8000/api/monitoring/health/
curl http://localhost:8000/api/monitoring/metrics/

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets
```

## Extending the Monitoring

### Adding Custom Metrics

1. Import the metrics collector:
   ```python
   from core.monitoring import metrics_collector
   ```

2. Add custom metrics:
   ```python
   # Increment a counter
   metrics_collector.increment_counter('custom_events_total')
   
   # Record a histogram value
   metrics_collector.record_histogram('custom_duration', duration_seconds)
   ```

### Adding New Health Checks

1. Extend the `HealthChecker` class in `core/monitoring.py`
2. Add the new check to the `health_detailed` view
3. Update the Grafana dashboard if needed

### Custom Log Types

Use the structured logging functions:
```python
from core.logging_config import log_performance, log_business_event

# Log performance metrics
log_performance("database_query", duration_ms=150, query_type="SELECT")

# Log business events
log_business_event("user_registration", user_id=123, source="web")
```

## Monitoring Best Practices

1. **Set Baselines**: Establish normal operating ranges for key metrics
2. **Monitor Trends**: Look for gradual changes that indicate issues
3. **Alert Fatigue**: Avoid too many alerts; focus on actionable items
4. **Regular Reviews**: Weekly review of metrics and logs
5. **Documentation**: Keep monitoring documentation updated

## Support

For monitoring-related issues:
1. Check this documentation
2. Review application logs
3. Verify monitoring service health
4. Check Prometheus and Grafana configurations
