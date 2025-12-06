from loguru import logger
from pymongo import MongoClient

from core import config
from core.models import Conversation, ConversationUser


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
            for c in self.conversations_collection.find({f"users.{user_id}": {"$exists": True}})
        ]

    def get_user_ids(self, conversation_id: str) -> list[str]:
        conversation = self.get_conversation(conversation_id)
        return list(conversation.users.keys())

    def add_user_id_to_conversation(self, user_id: str, conversation_id: str) -> None:
        # Check if user already exists in conversation
        conversation = self.get_conversation(conversation_id)
        if user_id not in conversation.users:
            # Only add user if they don't already exist
            self.conversations_collection.update_one(
                {"id": conversation_id},
                {"$set": {f"users.{user_id}": ConversationUser(user_id=user_id).model_dump()}},
            )
            logger.info(f"Successfully added user {user_id} to conversation {conversation_id}")
        else:
            logger.info(f"User {user_id} already exists in conversation {conversation_id}")

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

    def leave_conversation(self, user_id: str, conversation_id: str) -> Conversation:
        conversation = self.get_conversation(conversation_id)
        if user_id not in conversation.users:
            raise ValueError("User is not in conversation")
        if len(conversation.users) == 1:
            raise ValueError("User is the last one in conversation")

        # Remove user from conversation
        self.conversations_collection.update_one(
            {"id": conversation_id},
            {"$unset": {f"users.{user_id}": ""}},
        )
        del conversation.users[user_id]
        logger.info(f"Successfully left conversation {conversation_id}")

        # Update admin if necessary
        if conversation.admin_id == user_id:
            conversation.admin_id = list(conversation.users.keys())[0]
            self.conversations_collection.update_one(
                {"id": conversation_id},
                {"$set": {"admin_id": conversation.admin_id}},
            )
            logger.info(f"Promoted user {conversation.admin_id} to admin of conversation {conversation_id}")

        return conversation

    def update_conversation_user(
        self,
        conversation_id: str,
        user_id: str,
        pseudo: str | None = None,
        smiley: str | None = None,
    ) -> ConversationUser:
        """Update user data in a conversation"""
        # Get current user data or create new
        conversation = self.get_conversation(conversation_id)
        current_user = conversation.users.get(user_id, ConversationUser(user_id=user_id))

        # Update fields if provided
        if pseudo is not None:
            current_user.pseudo = pseudo
        if smiley is not None:
            current_user.smiley = smiley

        # Update in database
        self.conversations_collection.update_one(
            {"id": conversation_id},
            {"$set": {f"users.{user_id}": current_user.model_dump()}},
        )
        logger.info(f"Successfully updated user {user_id} data in conversation {conversation_id}")
        return current_user

    def get_conversation_user(self, conversation_id: str, user_id: str) -> ConversationUser | None:
        """Get user data for a specific user in a conversation"""
        conversation = self.get_conversation(conversation_id)
        return conversation.users.get(user_id)
