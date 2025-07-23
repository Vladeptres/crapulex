from loguru import logger
from pymongo import MongoClient

from core import config
from core.models import Conversation


class ConversationsStore:
    def __init__(self, db_name: str):
        self.db_name = db_name
        self.client = MongoClient(config.MONGO_DB_URL)
        self.db = self.client[self.db_name]
        self.conversations_collection = self.db[config.CONVERSATIONS_COLLECTION]
        logger.info("Successfully initialized Conversations Store")

    def add_conversation(self, conversation: Conversation) -> None:
        Conversation.model_validate(conversation)
        self.conversations_collection.insert_one(conversation.model_dump())

    def get_conversation(self, conversation_id: str) -> Conversation:
        return Conversation.model_validate(self.conversations_collection.find_one({"id": conversation_id}))

    def get_conversations(self, user_id: str) -> list[Conversation]:
        return [
            Conversation.model_validate(c)
            for c in self.conversations_collection.find({"users_ids": {"$in": [user_id]}})
        ]

    def get_user_ids(self, conversation_id: str) -> list[str]:
        return self.conversations_collection.find_one({"id": conversation_id}, {"users_ids": 1})["users_ids"]

    def add_user_id_to_conversation(self, user_id: str, conversation_id: str) -> None:
        self.conversations_collection.update_one({"id": conversation_id}, {"$addToSet": {"users_ids": user_id}})
        logger.info(f"Succesfully added user {user_id} to conversation {conversation_id}")

    def update_conversation(self, conversation: Conversation) -> None:
        self.conversations_collection.update_one(
            {"id": conversation.id},
            {"$set": conversation.model_dump(exclude_unset=True)},
        )
        logger.info(f"Succesfully updated conversation {conversation.id}")

    def delete_conversation(self, user_id: str, conversation_id: str) -> None:
        conversation = self.get_conversation(conversation_id)
        if user_id != conversation.admin_id:
            raise ValueError("User is not admin of conversation")
        self.conversations_collection.delete_one({"id": conversation_id})
        logger.info(f"Succesfully deleted conversation {conversation_id}")

    def leave_conversation(self, user_id: str, conversation_id: str) -> None:
        conversation = self.get_conversation(conversation_id)
        if user_id not in conversation.users_ids:
            raise ValueError("User is not in conversation")
        if len(conversation.users_ids) == 1:
            raise ValueError("User is the last one in conversation")
        self.conversations_collection.update_one({"id": conversation_id}, {"$pull": {"users_ids": user_id}})
        conversation.users_ids.remove(user_id)
        logger.info(f"Succesfully left conversation {conversation_id}")
        if conversation.admin_id == user_id:
            conversation.admin_id = conversation.users_ids[0]
        self.conversations_collection.update_one(
            {"id": conversation_id},
            {"$set": conversation.model_dump(exclude_unset=True)},
        )
        logger.info(f"Promoted user {user_id} to admin of conversation {conversation_id}")
        return conversation
