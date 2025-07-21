from pymongo import MongoClient
from core import config as cf

from loguru import logger

def update_conversations_collections():
    client = MongoClient(cf.MONGO_DB_URL)
    db = client[cf.MONGO_DB_NAME]
    conversations_collection = db[cf.CONVERSATIONS_COLLECTION]
    for conversation in conversations_collection.find():
        logger.info("Updating conversation " + str(conversation["name"]))
        conversations_collection.update_one(
            {"_id": conversation["_id"]},
            {"$set": {"is_visible": True}},
        )
    logger.success("Finished converting all discussions.")
    client.close()
