"""
Monitoring API endpoints for health checks and metrics collection.
"""
from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from core.monitoring import metrics_collector, HealthChecker
import json
from datetime import datetime, timezone


@require_http_methods(["GET"])
def health_check(request):
    """Basic health check endpoint."""
    return JsonResponse({
        'status': 'healthy',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'service': 'bourracho-backend'
    })


@require_http_methods(["GET"])
def health_detailed(request):
    """Detailed health check with all system components."""
    health_status = {
        'status': 'healthy',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'service': 'bourracho-backend',
        'checks': {}
    }
    
    # Check database
    db_health = HealthChecker.check_database()
    health_status['checks']['database'] = db_health
    
    # Check Redis
    redis_health = HealthChecker.check_redis()
    health_status['checks']['redis'] = redis_health
    
    # Check MongoDB
    mongo_health = HealthChecker.check_mongodb()
    health_status['checks']['mongodb'] = mongo_health
    
    # Get system health
    system_health = HealthChecker.get_system_health()
    health_status['checks']['system'] = {
        'status': 'healthy',
        'details': system_health
    }
    
    # Determine overall health status
    unhealthy_checks = [
        name for name, check in health_status['checks'].items() 
        if check.get('status') == 'unhealthy'
    ]
    
    if unhealthy_checks:
        health_status['status'] = 'unhealthy'
        health_status['unhealthy_checks'] = unhealthy_checks
    
    # Return appropriate HTTP status code
    status_code = 200 if health_status['status'] == 'healthy' else 503
    
    return JsonResponse(health_status, status=status_code)


@require_http_methods(["GET"])
def metrics_json(request):
    """Get application metrics in JSON format."""
    metrics = metrics_collector.get_metrics()
    metrics['timestamp'] = datetime.now(timezone.utc).isoformat()
    
    return JsonResponse(metrics)


@require_http_methods(["GET"])
def metrics_prometheus(request):
    """Get application metrics in Prometheus format."""
    metrics = metrics_collector.get_metrics()
    
    # Convert metrics to Prometheus format
    prometheus_metrics = []
    
    # Basic counters
    prometheus_metrics.append(f"# HELP bourracho_requests_total Total number of HTTP requests")
    prometheus_metrics.append(f"# TYPE bourracho_requests_total counter")
    prometheus_metrics.append(f"bourracho_requests_total {metrics['requests_total']}")
    
    prometheus_metrics.append(f"# HELP bourracho_errors_total Total number of HTTP errors")
    prometheus_metrics.append(f"# TYPE bourracho_errors_total counter")
    prometheus_metrics.append(f"bourracho_errors_total {metrics['errors_total']}")
    
    # Gauges
    prometheus_metrics.append(f"# HELP bourracho_active_connections Current active connections")
    prometheus_metrics.append(f"# TYPE bourracho_active_connections gauge")
    prometheus_metrics.append(f"bourracho_active_connections {metrics['active_connections']}")
    
    prometheus_metrics.append(f"# HELP bourracho_uptime_seconds Application uptime in seconds")
    prometheus_metrics.append(f"# TYPE bourracho_uptime_seconds gauge")
    prometheus_metrics.append(f"bourracho_uptime_seconds {metrics['uptime_seconds']}")
    
    # Response time metrics
    prometheus_metrics.append(f"# HELP bourracho_response_time_avg_ms Average response time in milliseconds")
    prometheus_metrics.append(f"# TYPE bourracho_response_time_avg_ms gauge")
    prometheus_metrics.append(f"bourracho_response_time_avg_ms {metrics['avg_response_time_ms']}")
    
    prometheus_metrics.append(f"# HELP bourracho_response_time_p95_ms 95th percentile response time in milliseconds")
    prometheus_metrics.append(f"# TYPE bourracho_response_time_p95_ms gauge")
    prometheus_metrics.append(f"bourracho_response_time_p95_ms {metrics['p95_response_time_ms']}")
    
    # Rate metrics
    prometheus_metrics.append(f"# HELP bourracho_requests_per_second Requests per second")
    prometheus_metrics.append(f"# TYPE bourracho_requests_per_second gauge")
    prometheus_metrics.append(f"bourracho_requests_per_second {metrics['requests_per_second']}")
    
    prometheus_metrics.append(f"# HELP bourracho_error_rate Error rate (errors/total_requests)")
    prometheus_metrics.append(f"# TYPE bourracho_error_rate gauge")
    prometheus_metrics.append(f"bourracho_error_rate {metrics['error_rate']}")
    
    # Requests by method
    prometheus_metrics.append(f"# HELP bourracho_requests_by_method_total Total requests by HTTP method")
    prometheus_metrics.append(f"# TYPE bourracho_requests_by_method_total counter")
    for method, count in metrics['requests_by_method'].items():
        prometheus_metrics.append(f'bourracho_requests_by_method_total{{method="{method}"}} {count}')
    
    # Requests by status code
    prometheus_metrics.append(f"# HELP bourracho_requests_by_status_total Total requests by status code")
    prometheus_metrics.append(f"# TYPE bourracho_requests_by_status_total counter")
    for status, count in metrics['requests_by_status'].items():
        prometheus_metrics.append(f'bourracho_requests_by_status_total{{status="{status}"}} {count}')
    
    # Database metrics
    prometheus_metrics.append(f"# HELP bourracho_database_queries_total Total database queries")
    prometheus_metrics.append(f"# TYPE bourracho_database_queries_total counter")
    prometheus_metrics.append(f"bourracho_database_queries_total {metrics['database_queries']}")
    
    # Cache metrics
    prometheus_metrics.append(f"# HELP bourracho_cache_hits_total Total cache hits")
    prometheus_metrics.append(f"# TYPE bourracho_cache_hits_total counter")
    prometheus_metrics.append(f"bourracho_cache_hits_total {metrics['cache_hits']}")
    
    prometheus_metrics.append(f"# HELP bourracho_cache_misses_total Total cache misses")
    prometheus_metrics.append(f"# TYPE bourracho_cache_misses_total counter")
    prometheus_metrics.append(f"bourracho_cache_misses_total {metrics['cache_misses']}")
    
    prometheus_metrics.append(f"# HELP bourracho_cache_hit_rate Cache hit rate")
    prometheus_metrics.append(f"# TYPE bourracho_cache_hit_rate gauge")
    prometheus_metrics.append(f"bourracho_cache_hit_rate {metrics['cache_hit_rate']}")
    
    response = HttpResponse('\n'.join(prometheus_metrics), content_type='text/plain; charset=utf-8')
    return response


@require_http_methods(["GET"])
def monitoring_dashboard(request):
    """Simple HTML dashboard for monitoring."""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Bourracho Backend Monitoring</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; }
            .card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .metric { display: inline-block; margin: 10px; padding: 15px; background: #f8f9fa; border-radius: 4px; min-width: 150px; }
            .metric-value { font-size: 24px; font-weight: bold; color: #007bff; }
            .metric-label { font-size: 12px; color: #666; text-transform: uppercase; }
            .status-healthy { color: #28a745; }
            .status-unhealthy { color: #dc3545; }
            .refresh-btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
            .refresh-btn:hover { background: #0056b3; }
            h1, h2 { color: #333; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        </style>
        <script>
            function refreshData() {
                fetch('/api/monitoring/metrics/')
                    .then(response => response.json())
                    .then(data => updateMetrics(data))
                    .catch(error => console.error('Error:', error));
                
                fetch('/api/monitoring/health/detailed/')
                    .then(response => response.json())
                    .then(data => updateHealth(data))
                    .catch(error => console.error('Error:', error));
            }
            
            function updateMetrics(data) {
                document.getElementById('requests-total').textContent = data.requests_total || 0;
                document.getElementById('requests-per-sec').textContent = (data.requests_per_second || 0).toFixed(2);
                document.getElementById('avg-response-time').textContent = (data.avg_response_time_ms || 0).toFixed(1) + 'ms';
                document.getElementById('error-rate').textContent = ((data.error_rate || 0) * 100).toFixed(2) + '%';
                document.getElementById('active-connections').textContent = data.active_connections || 0;
                document.getElementById('uptime').textContent = formatUptime(data.uptime_seconds || 0);
            }
            
            function updateHealth(data) {
                const healthStatus = document.getElementById('health-status');
                healthStatus.textContent = data.status;
                healthStatus.className = data.status === 'healthy' ? 'status-healthy' : 'status-unhealthy';
                
                // Update individual service statuses
                Object.keys(data.checks || {}).forEach(service => {
                    const element = document.getElementById(`health-${service}`);
                    if (element) {
                        const status = data.checks[service].status;
                        element.textContent = status;
                        element.className = status === 'healthy' ? 'status-healthy' : 'status-unhealthy';
                    }
                });
            }
            
            function formatUptime(seconds) {
                const days = Math.floor(seconds / 86400);
                const hours = Math.floor((seconds % 86400) / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                return `${days}d ${hours}h ${minutes}m`;
            }
            
            // Auto-refresh every 30 seconds
            setInterval(refreshData, 30000);
            
            // Initial load
            window.onload = refreshData;
        </script>
    </head>
    <body>
        <div class="container">
            <h1>🍺 Bourracho Backend Monitoring</h1>
            
            <div class="card">
                <h2>System Status</h2>
                <button class="refresh-btn" onclick="refreshData()">Refresh Data</button>
                <p>Overall Health: <span id="health-status" class="status-healthy">Loading...</span></p>
                
                <div class="grid">
                    <div>
                        <h3>Service Health</h3>
                        <p>Database: <span id="health-database">Loading...</span></p>
                        <p>Redis: <span id="health-redis">Loading...</span></p>
                        <p>MongoDB: <span id="health-mongodb">Loading...</span></p>
                        <p>System: <span id="health-system">Loading...</span></p>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <h2>Application Metrics</h2>
                <div class="grid">
                    <div class="metric">
                        <div class="metric-value" id="requests-total">0</div>
                        <div class="metric-label">Total Requests</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value" id="requests-per-sec">0</div>
                        <div class="metric-label">Requests/Second</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value" id="avg-response-time">0ms</div>
                        <div class="metric-label">Avg Response Time</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value" id="error-rate">0%</div>
                        <div class="metric-label">Error Rate</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value" id="active-connections">0</div>
                        <div class="metric-label">Active Connections</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value" id="uptime">0d 0h 0m</div>
                        <div class="metric-label">Uptime</div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <h2>Quick Links</h2>
                <p><a href="/api/monitoring/health/" target="_blank">Basic Health Check</a></p>
                <p><a href="/api/monitoring/health/detailed/" target="_blank">Detailed Health Check</a></p>
                <p><a href="/api/monitoring/metrics/" target="_blank">Metrics (JSON)</a></p>
                <p><a href="/api/monitoring/metrics/prometheus/" target="_blank">Prometheus Metrics</a></p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return HttpResponse(html_content, content_type='text/html')
