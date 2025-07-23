from pymongo import MongoClient
from loguru import logger
import os

MONGO_DB_URL = os.environ.get("MONGO_DB_URL", "mongodb://localhost:27017")
def update_conversations_collections(from_db: str, to_db: str):
    try:
        client = MongoClient(MONGO_DB_URL)
        old_db = client[from_db]
        new_db = client[to_db]
        conversations_collection = old_db["conversations"]
        for conversation in conversations_collection.find():
            logger.info("Updating conversation " + str(conversation["name"]))
            conversation["is_visible"] = True
            if conversation["users_ids"]:
                conversation["admin_id"] = conversation["users_ids"][0]
            else:
                conversation["admin_id"] = ""
            new_db["conversations"].insert_one(conversation)

        logger.success("Finished converting all discussions.")
        logger.info("Copying Users")
        users_collection = old_db["users"]
        for user in users_collection.find():
            logger.info("Updating user " + str(user["username"]))
            new_db["users"].insert_one(user)
        logger.success("Finished converting all users.")
        messages_collection = old_db["messages"]
        for message in messages_collection.find():
            logger.info("Updating message " + str(message["id"]))
            message["medias_metadas"] = []
            new_db["messages"].insert_one(message)
        logger.success("Finished converting all messages.")
        client.close()
    except Exception as e:
        logger.error("Error converting collections: " + str(e))
        raise e
