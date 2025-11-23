#!/bin/bash

# Bourracho Backend Monitoring Setup Script
# This script helps you start and verify the monitoring stack

set -e

echo "🍺 Starting Bourracho Backend Monitoring Stack..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start the services
echo "📦 Starting all services..."
docker compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Check service health
echo "🔍 Checking service health..."

# Check backend health
if curl -f -s http://localhost:8000/api/monitoring/health/ > /dev/null; then
    echo "✅ Backend is healthy"
else
    echo "❌ Backend health check failed"
fi

# Check Prometheus
if curl -f -s http://localhost:9090/-/healthy > /dev/null; then
    echo "✅ Prometheus is healthy"
else
    echo "❌ Prometheus health check failed"
fi

# Check Grafana
if curl -f -s http://localhost:3001/api/health > /dev/null; then
    echo "✅ Grafana is healthy"
else
    echo "❌ Grafana health check failed"
fi

echo ""
echo "🎉 Monitoring stack is ready!"
echo ""
echo "📊 Access your monitoring interfaces:"
echo "   • Built-in Dashboard: http://localhost:8000/api/monitoring/"
echo "   • Grafana Dashboard:  http://localhost:3001 (admin/admin123)"
echo "   • Prometheus:         http://localhost:9090"
echo "   • Health Check:       http://localhost:8000/api/monitoring/health/"
echo ""
echo "📋 Quick commands:"
echo "   • View logs:          docker compose logs -f backend"
echo "   • Stop monitoring:    docker compose down"
echo "   • View documentation: cat MONITORING.md"
echo ""
echo "🔧 Troubleshooting:"
echo "   • Check service status: docker compose ps"
echo "   • View all logs:        docker compose logs"
echo "   • Restart services:     docker compose restart"
