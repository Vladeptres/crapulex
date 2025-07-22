from pymongo import MongoClient
from core import config as cf

from loguru import logger

def update_conversations_collections(from_db: str, to_db: str):
    try:
        client = MongoClient(cf.MONGO_DB_URL)
        old_db = client[from_db]
        new_db = client[to_db]
        conversations_collection = old_db[cf.CONVERSATIONS_COLLECTION]
        for conversation in conversations_collection.find():
            logger.info("Updating conversation " + str(conversation["name"]))
            conversation["is_visible"] = True
            new_db[cf.CONVERSATIONS_COLLECTION].insert_one(conversation)

        logger.success("Finished converting all discussions.")
        logger.info("Copying Users")
        users_collection = old_db[cf.USERS_COLLECTION]
        for user in users_collection.find():
            logger.info("Updating user " + str(user["username"]))
            new_db[cf.USERS_COLLECTION].insert_one(user)
        logger.success("Finished converting all users.")
        messages_collection = old_db[cf.MESSAGES_COLLECTION]
        for message in messages_collection.find():
            logger.info("Updating message " + str(message["id"]))
            new_db[cf.MESSAGES_COLLECTION].insert_one(message)
        logger.success("Finished converting all messages.")
        client.close()
    except Exception as e:
        logger.error("Error converting collections: " + str(e))
        raise e
