import os
import redis
from pymongo import MongoClient

# MongoDB Configuration - using consistent variable names

MONGO_DB_USERNAME = os.environ.get("MONGO_ROOT_USERNAME")
MONGO_DB_PASSWORD = os.environ.get("MONGO_ROOT_PASSWORD")
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "bourracho_db")
MONGO_DB_HOST = os.environ.get("MONGO_DB_HOST", "localhost")
MONGO_DB_PORT = os.environ.get("MONGO_DB_PORT", "27017")

# Construct MongoDB URL from components
MONGO_DB_URL = f"mongodb://{MONGO_DB_USERNAME}:{MONGO_DB_PASSWORD}@{MONGO_DB_HOST}:{MONGO_DB_PORT}"

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
MEDIA_STORAGE_PATH = os.environ.get("MEDIA_STORAGE_PATH", "media_files")

# AWS S3 Configuration
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "bourracho-test")
S3_REGION = os.environ.get("S3_REGION", "eu-north-1")
S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL", "https://s3.eu-north-1.amazonaws.com")
S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID", "")
S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY", "")


def get_redis_client():
    """Get Redis client instance."""
    return redis.Redis(
        host=REDIS_HOST,
        port=int(REDIS_PORT),
        password=REDIS_PASSWORD if REDIS_PASSWORD else None,
        db=int(REDIS_DB),
        decode_responses=True
    )


def get_mongo_client():
    """Get MongoDB client instance."""
    return MongoClient(MONGO_DB_URL)
