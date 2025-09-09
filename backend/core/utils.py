from datetime import datetime

import pytz
from loguru import logger
from pymongo import MongoClient

from core import config


def check_db_connection():
    try:
        logger.info("Checking connection to Mongo DB...")
        client = MongoClient(config.MONGO_DB_URL)
        client.server_info()
        logger.success("Connection to Mongo DB OK.")
    except Exception as e:
        raise ValueError(f"Failed to connect to MongoDB: {e}") from e


def now_paris() -> datetime:
    return pytz.timezone("Europe/Paris").localize(datetime.now())  # noqa: DTZ005
