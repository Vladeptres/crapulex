#!/bin/bash

# Test runner script that uses test environment configuration
# This script ensures tests use the test Redis container on port 6380

set -e

echo "🧪 Starting test environment..."

# Load test environment variables
export $(grep -v '^#' ../.env.test | xargs)

# Start test containers if not running
echo "🚀 Starting test containers (MongoDB + Redis)..."
docker compose -f ../docker-compose.test.yml up -d mongodb-test redis-test

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to be ready..."
until docker exec bourracho-redis-test redis-cli ping > /dev/null 2>&1; do
  sleep 1
done

# Wait for MongoDB to be ready
echo "⏳ Waiting for MongoDB to be ready..."
until docker exec bourracho-mongodb-test mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
  sleep 1
done

echo "✅ Test containers are ready!"

# Run tests with test environment variables
echo "🧪 Running tests..."
uv run pytest "$@"

echo "✅ Tests completed!"
