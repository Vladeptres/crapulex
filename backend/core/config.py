import os

import redis
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

# MongoDB Configuration - using consistent variable names

MONGO_DB_USERNAME = os.environ.get("MONGO_ROOT_USERNAME")
MONGO_DB_PASSWORD = os.environ.get("MONGO_ROOT_PASSWORD")
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "bourracho_db")
MONGO_DB_HOST = os.environ.get("MONGO_DB_HOST", "localhost")
MONGO_DB_PORT = os.environ.get("MONGO_DB_PORT", "27017")

# Construct MongoDB URL from components
MONGO_DB_URL = f"mongodb://{MONGO_DB_USERNAME}:{MONGO_DB_PASSWORD}@{MONGO_DB_HOST}:{MONGO_DB_PORT}/{MONGO_DB_NAME}?authSource=admin"

# Redis Configuration
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = os.environ.get("REDIS_PORT", "6379")
REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD", "")
REDIS_DB = os.environ.get("REDIS_DB", "0")

# Construct Redis URL from components
if REDIS_PASSWORD:
    REDIS_URL = os.environ.get("REDIS_URL", f"redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}")
else:
    REDIS_URL = os.environ.get("REDIS_URL", f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}")

# Collection names
CONVERSATIONS_COLLECTION = "conversations"
USERS_COLLECTION = "users"
MESSAGES_COLLECTION = "messages"

# Media storage
# MEDIA_STORAGE_URI determines the storage backend:
#   - "s3://bucket-name"  -> AWS S3 (requires S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)
#   - "/some/local/path"  -> Local MinIO instance (requires MINIO_ROOT_USER, MINIO_ROOT_PASSWORD)
MEDIA_STORAGE_URI = os.environ.get("MEDIA_STORAGE_URI", "media_files")

# AWS S3 Configuration (used when MEDIA_STORAGE_URI starts with s3://)
S3_REGION = os.environ.get("S3_REGION", "eu-north-1")
S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID", "")
S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY", "")

# MinIO Configuration (used when MEDIA_STORAGE_URI is a local path)
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://localhost:9000")
MINIO_ROOT_USER = os.environ.get("MINIO_ROOT_USER", "minioadmin")
MINIO_ROOT_PASSWORD = os.environ.get("MINIO_ROOT_PASSWORD", "minioadmin")


def get_redis_client():
    """Get Redis client instance."""
    return redis.Redis(
        host=REDIS_HOST,
        port=int(REDIS_PORT),
        password=REDIS_PASSWORD if REDIS_PASSWORD else None,
        db=int(REDIS_DB),
        decode_responses=True,
    )


def get_mongo_client():
    """Get MongoDB client instance."""
    return MongoClient(MONGO_DB_URL)
