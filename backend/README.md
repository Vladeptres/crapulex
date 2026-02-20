# Bourracho Backend

Welcome to bourracho repository where tech-enjoyers meet techno-kiffers!

This README provides comprehensive guidelines for setting up, developing, testing, and deploying the Bourracho backend application.

## 1. Setup

### Prerequisites

Before you begin, ensure you have the following installed:

- **Docker & Docker Compose** - [Install here](https://docs.docker.com/get-docker/)
- **Python** (3.11 or higher) - [Download here](https://python.org/)
- **uv** (Python package manager) - [Install with](https://docs.astral.sh/uv/getting-started/installation/): `pip install uv`
- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/) (for frontend integration)

### Initial Setup

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd bourracho
   ```

2. **Install Backend Dependencies**
   ```bash
   cd backend
   uv sync
   ```

3. **Environment Variables**
   
   The project uses centralized environment variable management. Copy the appropriate environment file:
   
   ```bash
   # For development
   cp .env.example .env.local
   
   # For testing
   cp .env.example .env.test
   
   # For staging
   cp .env.example .env.staging
   
   # For production
   cp .env.example .env.production
   ```
   
   **Key Environment Variables:**
   - `MONGO_DB_HOST`, `MONGO_DB_PORT`, `MONGO_DB_USERNAME`, `MONGO_DB_PASSWORD`: MongoDB connection
   - `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Redis connection
   - `MEDIA_STORAGE_URI`: Media storage (`s3://bucket` for AWS S3, or local path for MinIO)
   - `DJANGO_SECRET_KEY`: Django secret key for security
   - `DEBUG`: Set to `True` for development, `False` for production

4. **Database Setup**
   ```bash
   # Create and apply migrations
   uv run manage.py makemigrations
   uv run manage.py migrate
   
   # Create superuser (optional)
   uv run manage.py createsuperuser
   ```

## 2. Backend Development

### Development Environment Setup

#### Option 1: Docker Compose (Recommended)

```bash
# Start all backend services (MongoDB, Redis, Backend)
docker compose up -d

# View backend logs
docker compose logs -f backend

# Stop services
docker compose down
```

#### Option 2: Manual Setup

```bash
cd backend

# Start Redis container
docker run -p 6379:6379 -d redis:latest

# Start MongoDB container
docker run -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password123 \
  -d mongo:latest

# Load development environment
source .env.local

# Run the development server
uv run manage.py runserver
```

or via Docker (standalone):

```bash
docker build -f docker/Dockerfile -t bourracho-backend .
docker run --env-file .env.dev -p 8000:8000 bourracho-backend
```

or via Docker Compose (recommended - includes MongoDB and Redis):

#### Development Environment
```bash
# Start development services (MongoDB on 27017, Redis on 6380, Backend on 8002)
docker compose --env-file .env.dev -f docker/docker-compose.yml up --build

# Or run in background
docker compose --env-file .env.dev -f docker/docker-compose.yml up -d --build

# Stop services
docker compose --env-file .env.dev -f docker/docker-compose.yml down

# View logs
docker compose --env-file .env.dev -f docker/docker-compose.yml logs -f backend
```

#### Production Environment
```bash
# Start production services (MongoDB on 27017, Redis on 6379, Backend on 8001)
docker compose --env-file .env.prod -f docker/docker-compose.yml up --build

# Or run in background
docker compose --env-file .env.prod -f docker/docker-compose.yml up -d --build

# Stop services
docker compose --env-file .env.prod -f docker/docker-compose.yml down

# View logs
docker compose --env-file .env.prod -f docker/docker-compose.yml logs -f backend
```

#### Running Both Environments Simultaneously
You can run both development and production environments at the same time since they use different ports and container names:

```bash
# Terminal 1: Start development environment
docker compose --env-file .env.dev -f docker/docker-compose.yml up -d --build

# Terminal 2: Start production environment  
docker compose --env-file .env.prod -f docker/docker-compose.yml up -d --build

# Check both are running
docker ps | grep bourracho
```

**Important**: Make sure to update the production credentials in `.env.prod` before deploying to production!

### Backend Testing Guidelines

#### Running Tests

The project includes a dedicated test environment with isolated containers:

```bash
cd backend

# Run all tests using the test runner script (recommended)
./run_tests.sh

# Run specific test files
./run_tests.sh tests/test_api.py

# Run tests with coverage
./run_tests.sh --coverage
```

#### Manual Test Environment

```bash
# Start test containers
docker compose -f ../docker-compose.test.yml up -d mongodb-test redis-test

# Load test environment variables
source .env.test

# Run tests
uv run pytest

# Run specific tests
uv run pytest tests/test_websocket.py -v

# Clean up test containers
docker compose -f ../docker-compose.test.yml down
```

#### Test Environment Configuration

- **MongoDB Test**: `localhost:27018` (username: `test_admin`, password: `test_password`)
- **Redis Test**: `localhost:6380` (no authentication)
- **Test Database**: `bourracho_test_db`
- **Isolated Environment**: Tests run in complete isolation from development data

### Backend Development Commands

```bash
cd backend

# Development server
uv run manage.py runserver

# Run migrations
uv run manage.py makemigrations
uv run manage.py migrate

# Django shell
uv run manage.py shell

# Collect static files
uv run manage.py collectstatic

# Create superuser
uv run manage.py createsuperuser

# Run linting
uv run ruff check .
uv run ruff format .
```

### API Testing

Once the backend is running, you can access:

- **API Documentation**: `http://localhost:8000/api/docs/`
- **Django Admin**: `http://localhost:8000/admin/`
- **Health Check**: `http://localhost:8000/api/health/`

### Testing Individual Features

1. **Authentication API**:
   ```bash
   curl -X POST http://localhost:8000/api/auth/login/ \
     -H "Content-Type: application/json" \
     -d '{"username": "your_username", "password": "your_password"}'
   ```

2. **WebSocket Connection**:
   Use a WebSocket client to connect to `ws://localhost:8000/ws/chat/{conversation_id}/`

3. **Database Operations**:
   ```bash
   # Test database connection
   uv run manage.py dbshell
   
   # Check migrations status
   uv run manage.py showmigrations
   ```

## 3. Frontend Integration

### Testing Approaches

There are two ways to test frontend integration:

#### Approach 1: Containerized Testing (Recommended)
Use this when you want a complete isolated environment with all services in containers.

#### Approach 2: Manual Backend Testing
Use this when you want to run the backend locally for debugging while using test databases.

### Approach 1: Containerized Testing Setup

#### Step 1: Start All Test Containers
```bash
# Start all test services (MongoDB, Redis, Backend API)
docker compose -f docker-compose.test.yml up -d

# Check that all containers are running
docker compose -f docker-compose.test.yml ps

# Wait for backend to be healthy (about 30-40 seconds)
docker compose -f docker-compose.test.yml logs -f backend-test
```

#### Step 2: Setup Frontend for Containerized Testing
```bash
cd frontend

# Install frontend dependencies
npm install

# Create frontend environment file for containerized testing
cat > .env.test << EOF
VITE_API_BASE_URL=http://localhost:8001
VITE_ENVIRONMENT=test
EOF

# Start frontend development server
npm run dev
```

### Approach 2: Manual Backend Testing Setup

#### Step 1: Start Only Test Database Containers
```bash
# Start only MongoDB and Redis test containers
docker compose -f docker-compose.test.yml up -d mongodb-test redis-test

# Wait for containers to be ready (about 10-15 seconds)
sleep 15
```

#### Step 2: Run Backend Manually with Test Environment
```bash
# Load test environment variables (from project root)
source .env.test

cd backend

# Apply test database migrations
uv run manage.py migrate

# Create test superuser (optional)
echo "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.create_superuser('admin', 'admin@test.com', 'testpass123')" | uv run manage.py shell

# Start backend server with test environment
uv run manage.py runserver
```

#### Step 3: Setup Frontend for Manual Backend Testing
```bash
cd frontend

# Install frontend dependencies
npm install

# Create frontend environment file for manual backend testing
cat > .env.test << EOF
VITE_API_BASE_URL=http://localhost:8000
VITE_ENVIRONMENT=test
EOF

# Start frontend development server
npm run dev
```

### Frontend-Backend Connection Configuration

#### Containerized Testing
- **Backend API**: `http://localhost:8001/api/` (backend-test container)
- **WebSocket**: `ws://localhost:8001/ws/`
- **Frontend**: `http://localhost:5173`
- **Test Databases**: MongoDB (port 27018), Redis (port 6380)

#### Manual Backend Testing
- **Backend API**: `http://localhost:8000/api/` (local backend process)
- **WebSocket**: `ws://localhost:8000/ws/`
- **Frontend**: `http://localhost:5173`
- **Test Databases**: MongoDB (port 27018), Redis (port 6380)

### Integration Testing Workflow

#### Containerized Approach (Recommended)
```bash
# Terminal 1: Start all test containers
docker compose -f docker-compose.test.yml up -d

# Terminal 2: Start frontend
cd frontend
npm run dev

# Access frontend at http://localhost:5173
# Backend API available at http://localhost:8001/api/docs/
```

#### Manual Approach (For Debugging)
```bash
# Terminal 1: Start test databases only
docker compose -f docker-compose.test.yml up -d mongodb-test redis-test

# Terminal 2: Start test backend manually
source .env.test
cd backend
uv run manage.py migrate
uv run manage.py runserver

# Terminal 3: Start frontend
cd frontend
npm run dev

# Access frontend at http://localhost:5173
# Backend API available at http://localhost:8000/api/docs/
```

### API Endpoints for Frontend Integration

**Authentication**:
- `POST /api/auth/login/` - User login
- `POST /api/auth/logout/` - User logout
- `GET /api/auth/me/` - Current user info

**Chat & Conversations**:
- `GET /api/conversations/` - List conversations
- `POST /api/conversations/` - Create conversation
- `GET /api/conversations/{id}/messages/` - Get messages
- `POST /api/conversations/{id}/messages/` - Send message
- `WebSocket /ws/chat/{conversation_id}/` - Real-time chat

**File Management**:
- `POST /api/files/upload/` - Upload files
- `GET /api/files/{id}/` - Download files

### Cleanup After Integration Testing

```bash
# Stop all services
Ctrl+C  # Stop frontend and backend servers

# Clean up test containers
docker compose -f docker-compose.test.yml down

# Remove test volumes (optional)
docker compose -f docker-compose.test.yml down -v
```

## 4. Deployment

### Staging Deployment

#### Prerequisites
- Docker and Docker Compose V2 installed on staging server
- SSL certificates configured
- Domain/subdomain pointing to staging server

#### Staging Setup

1. **Prepare Staging Environment**:
   ```bash
   # On staging server
   git clone <repository-url>
   cd bourracho
   
   # Copy and configure staging environment
   cp .env.example .env.staging
   
   # Edit .env.staging with staging-specific values:
   # - DJANGO_SECRET_KEY (generate new one)
   # - DEBUG=False
   # - ALLOWED_HOSTS=your-staging-domain.com
   # - Database credentials
   # - Redis credentials
   # - AWS S3 credentials
   ```

2. **Deploy to Staging**:
   ```bash
   # Build and start staging services
   docker compose -f docker-compose.staging.yml up -d
   
   # Check deployment status
   docker compose -f docker-compose.staging.yml logs -f
   
   # Run migrations
   docker compose -f docker-compose.staging.yml exec backend uv run manage.py migrate
   
   # Collect static files
   docker compose -f docker-compose.staging.yml exec backend uv run manage.py collectstatic --noinput
   ```

3. **Staging Health Check**:
   ```bash
   # Test API endpoints
   curl https://your-staging-domain.com/api/health/
   
   # Check logs
   docker compose -f docker-compose.staging.yml logs backend
   ```

### Production Deployment

#### Prerequisites
- Production server with Docker and Docker Compose V2
- SSL certificates (Let's Encrypt recommended)
- Production domain configured
- Backup strategy in place

#### Production Setup

1. **Prepare Production Environment**:
   ```bash
   # On production server
   git clone <repository-url>
   cd bourracho
   
   # Copy and configure production environment
   cp .env.example .env.production
   
   # Configure .env.production with production values:
   # - Strong DJANGO_SECRET_KEY
   # - DEBUG=False
   # - ALLOWED_HOSTS=your-domain.com
   # - Production database credentials
   # - Production Redis credentials
   # - Production AWS S3 credentials
   # - SENTRY_DSN for error tracking
   ```

2. **SSL Certificate Setup**:
   ```bash
   # Initialize Let's Encrypt certificates
   chmod +x scripts/init-letsencrypt.sh
   ./scripts/init-letsencrypt.sh
   ```

3. **Deploy to Production**:
   ```bash
   # Build and start production services
   docker compose -f docker-compose.prod.yml up -d
   
   # Verify deployment
   docker compose -f docker-compose.prod.yml ps
   
   # Run migrations
   docker compose -f docker-compose.prod.yml exec backend uv run manage.py migrate
   
   # Collect static files
   docker compose -f docker-compose.prod.yml exec backend uv run manage.py collectstatic --noinput
   
   # Create superuser
   docker compose -f docker-compose.prod.yml exec backend uv run manage.py createsuperuser
   ```

### Deployment Commands

#### Update Deployment
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart services
docker compose -f docker-compose.prod.yml up -d --build

# Run any new migrations
docker compose -f docker-compose.prod.yml exec backend uv run manage.py migrate
```

#### Backup and Restore
```bash
# Backup MongoDB
docker compose -f docker-compose.prod.yml exec mongodb mongodump --out /backup

# Backup Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli BGSAVE

# Restore MongoDB
docker compose -f docker-compose.prod.yml exec mongodb mongorestore /backup
```

#### Monitoring and Logs
```bash
# View all service logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f nginx

# Monitor resource usage
docker stats
```

### Environment-Specific Configuration

| Environment | Docker Compose File | Environment File | Ports | SSL |
|-------------|-------------------|------------------|-------|-----|
| Development | `docker-compose.yml` | `.env.local` | 8000, 5173 | No |
| Testing | `docker-compose.test.yml` | `.env.test` | 27018, 6380 | No |
| Staging | `docker-compose.staging.yml` | `.env.staging` | 80, 443 | Yes |
| Production | `docker-compose.prod.yml` | `.env.production` | 80, 443 | Yes |

### Troubleshooting Deployment

#### Common Issues

1. **Docker Compose V1 vs V2**:
   ```bash
   # Use 'docker compose' (V2) instead of 'docker-compose' (V1)
   docker compose up -d
   ```

2. **Container Build Issues**:
   ```bash
   # Force rebuild without cache
   docker compose -f docker-compose.prod.yml build --no-cache
   ```

3. **Database Connection Issues**:
   ```bash
   # Check container networking
   docker compose -f docker-compose.prod.yml exec backend ping mongodb
   
   # Verify environment variables
   docker compose -f docker-compose.prod.yml exec backend env | grep MONGO
   ```

4. **SSL Certificate Issues**:
   ```bash
   # Check certificate status
   docker compose -f docker-compose.prod.yml logs nginx
   
   # Renew certificates
   docker compose -f docker-compose.prod.yml exec certbot certbot renew
   ```

## Project Structure

```text
bourracho/
├── backend/                # Django backend
│   ├── core/               # Core business logic
│   ├── api/                # API endpoints
│   ├── tests/              # Backend tests
│   └── pyproject.toml      # Python dependencies
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom React hooks
│   │   └── api/            # API client
│   └── package.json        # Node.js dependencies
├── nginx/                  # Nginx configuration
├── scripts/                # Deployment scripts
├── docker-compose.yml      # Development environment
├── docker-compose.test.yml # Test environment
├── docker-compose.staging.yml # Staging environment
├── docker-compose.prod.yml # Production environment
└── .env.*                  # Environment configurations
```

## Contributing

1. Create a feature branch from `main`
2. Make your changes following the coding standards
3. Run tests: `./backend/run_tests.sh`
4. Test frontend integration
5. Submit a pull request

For more details, see [CONTRIBUTING.md](CONTRIBUTING.md).
