# Docker Deployment Guide for Bourracho

This guide explains how to deploy the Bourracho application using Docker on your Ubuntu server.

## Prerequisites

- Docker and Docker Compose installed on your Ubuntu server
- Git (to clone the repository)

## Quick Start

1. **Clone the repository** (if not already done):
   ```bash
   git clone <your-repo-url>
   cd bourracho
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit the `.env` file with your production values:
   - Change `BOURRACHO_SECRET_KEY` to a secure random string
   - Update `MONGO_ROOT_PASSWORD` to a strong password
   - Set `CORS_ALLOWED_ORIGINS` to your frontend domain(s)
   - Configure S3 settings if using AWS S3 for media storage

3. **Build and start the services**:
   ```bash
   docker-compose up -d
   ```

4. **Check service status**:
   ```bash
   docker-compose ps
   ```

## Services

The Docker Compose setup includes:

- **MongoDB**: Database service on port 27017
- **Redis**: Cache and message broker for Django Channels on port 6379
- **Backend**: Django API server on port 8000

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_ROOT_USERNAME` | MongoDB root username | `admin` |
| `MONGO_ROOT_PASSWORD` | MongoDB root password | `password123` |
| `MONGO_DB_NAME` | Database name | `bourracho_db` |
| `BOURRACHO_SECRET_KEY` | Django secret key | Auto-generated (change in production) |
| `DEBUG` | Django debug mode | `False` |
| `CORS_ALLOWED_ORIGINS` | Allowed CORS origins | `http://localhost:3000,http://localhost:5173` |

### Volumes

- `mongodb_data`: Persistent MongoDB data
- `redis_data`: Persistent Redis data  
- `media_files`: User-uploaded media files

## Management Commands

### Start services:
```bash
docker-compose up -d
```

### Stop services:
```bash
docker-compose down
```

### View logs:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
```

### Rebuild after code changes:
```bash
docker-compose down
docker-compose build --no-cache backend
docker-compose up -d
```

### Database backup:
```bash
docker exec bourracho-mongodb mongodump --username admin --password password123 --authenticationDatabase admin --db bourracho_db --out /data/backup
```

### Access MongoDB shell:
```bash
docker exec -it bourracho-mongodb mongosh -u admin -p password123 --authenticationDatabase admin
```

## Production Considerations

1. **Security**:
   - Change default passwords in `.env`
   - Use a strong `BOURRACHO_SECRET_KEY`
   - Consider using Docker secrets for sensitive data

2. **Networking**:
   - Use a reverse proxy (nginx) for HTTPS termination
   - Configure firewall to only expose necessary ports

3. **Monitoring**:
   - Set up log aggregation
   - Monitor container health and resource usage

4. **Backups**:
   - Regular MongoDB backups
   - Backup media files volume

## Troubleshooting

### Check service health:
```bash
docker-compose ps
docker-compose logs backend
```

### Reset everything (⚠️ destroys data):
```bash
docker-compose down -v
docker-compose up -d
```

### Update to latest code:
```bash
git pull
docker-compose build --no-cache backend
docker-compose up -d
```
