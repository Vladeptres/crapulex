import os

MONGO_DB_URL = os.environ.get("MONGO_DB_URL", "mongodb://localhost:27017")
MONGO_DB_USERNAME = os.environ.get("MONGO_DB_USERNAME", None)
MONGO_DB_PASSWORD = os.environ.get("MONGO_DB_PASSWORD", None)
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "bourracho_db_dev")

CONVERSATIONS_COLLECTION = "conversations"
USERS_COLLECTION = "users"
MESSAGES_COLLECTION = "messages"
MEDIA_STORAGE_PATH = os.environ.get("MEDIA_STORAGE_PATH", "media_files")


S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "bourracho-test")
S3_REGION = "eu-north-1"
S3_ENDPOINT_URL = "https://s3.eu-north-1.amazonaws.com"
S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID", "")
S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY", "")
