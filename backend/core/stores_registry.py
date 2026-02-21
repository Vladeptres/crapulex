import random
import string
import uuid
from datetime import datetime
from typing import Any

import pytz
from loguru import logger

from api.models import (
    ConversationCreate,
    ConversationUpdate,
    MediaMetadataResponse,
    MessagePost,
    MessageResponse,
    MessageUpdate,
    ReactPost,
    ReactResponse,
    UserCredentials,
)
from core.conversations_store import ConversationsStore
from core.medias_store import MediasStore
from core.messages_store import MessagesStore
from core.models import Conversation, ConversationUser, MediaMetadata, Message, React, User
from core.users_store import UsersStore
from core.utils import check_db_connection

check_db_connection()


class StoresRegistry:
    def __init__(self, db_name: str):
        self.db_name: str = db_name
        """Name of the database"""
        self.conversations_store: ConversationsStore = ConversationsStore(self.db_name)
        """Dict containing for each conversation an entry conversation_id: ConversationStore"""
        self.messages_store: MessagesStore = MessagesStore(self.db_name)
        """Dict containing for each conversation an entry conversation_id: ConversationStoresModel"""
        self.users_store: UsersStore = UsersStore(self.db_name)
        """Dict containing for each user an entry user_id: User"""
        self.medias_store: MediasStore = MediasStore()

    def register_user(self, user_credentials: UserCredentials) -> User:
        user = self.users_store.get_new_user(user_credentials.username, user_credentials.password)
        self.users_store.add_user(user=user)
        return user

    def check_credentials(self, user_credentials: UserCredentials) -> str | None:
        return self.users_store.check_credentials(
            username=user_credentials.username,
            password=user_credentials.password,
        )

    def authenticate_google_user(self, google_id: str, email: str, name: str | None = None) -> User:
        # First check if user already exists with this Google ID
        user = self.users_store.find_by_google_id(google_id)
        if user:
            return user

        # Check if a local user exists with this email and link accounts
        user = self.users_store.find_by_username(email)
        if user:
            if user.auth_provider == "local":
                # Link existing local account to Google
                user.auth_provider = "google"
                user.google_id = google_id
                self.users_store.users_collection.update_one(
                    {"id": user.id},
                    {"$set": {"auth_provider": "google", "google_id": google_id}},
                )
                logger.info(f"Linked existing local account {email} to Google")
            return user

        # Create a new Google user
        return self.users_store.create_google_user(google_id=google_id, email=email, name=name)

    def get_user(self, user_id: str) -> User | None:
        return self.users_store.get_user(user_id=user_id)

    def get_users(self, user_ids: list[str]) -> list[User]:
        return self.users_store.get_users(user_ids=user_ids)

    def create_conversation(
        self,
        user_id: str,
        conversation_create: ConversationCreate,
    ) -> str:
        if not user_id:
            raise ValueError("User ID is required to create conversation.")

        # Convert API model to core model
        conversation_id = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))  # noqa: S311
        conversation = Conversation(
            id=conversation_id,
            name=conversation_create.name,
            is_locked=conversation_create.is_locked,
            is_visible=conversation_create.is_visible,
            users={user_id: ConversationUser(user_id=user_id)},
            admin_id=user_id,
        )

        self.conversations_store.add_conversation(conversation=conversation)
        self.conversations_store.add_user_id_to_conversation(conversation_id=conversation.id, user_id=user_id)
        return conversation.id

    def join_conversation(self, user_id: str, conversation_id: str) -> None:
        if not user_id:
            raise ValueError("User ID is required to join conversation.")
        if not conversation_id:
            raise ValueError("Conversation ID is required to join conversation.")
        self.conversations_store.add_user_id_to_conversation(conversation_id=conversation_id, user_id=user_id)

    def get_conversations(self, user_id: str) -> list[Conversation]:
        if not user_id:
            raise ValueError("User ID is required to list conversations.")
        return self.conversations_store.get_conversations(user_id=user_id)

    def get_conversation(self, conversation_id: str) -> Conversation:
        return self.conversations_store.get_conversation(conversation_id=conversation_id)

    def update_conversation(self, conversation_id: str, conversation_update: ConversationUpdate) -> None:
        existing_conversation = self.conversations_store.get_conversation(conversation_id=conversation_id)
        updated_conversation = Conversation(
            **conversation_update.model_dump(exclude_unset=True),
            **existing_conversation.model_dump(exclude=set(conversation_update.model_dump(exclude_unset=True).keys())),
        )
        self.conversations_store.update_conversation(updated_conversation)

    def add_message(self, message_post: MessagePost, medias: list[Any] | None = None) -> MessageResponse:
        conversation = self.conversations_store.get_conversation(message_post.conversation_id)
        if message_post.issuer_id not in conversation.users:
            raise ValueError(
                f"User {message_post.issuer_id} is not among registered user of "
                f"conversation {message_post.conversation_id}",
            )

        medias_metadas = []
        if medias:
            medias_metadas = [
                self.medias_store.upload_media(
                    uploaded_file=media,
                    conversation_id=message_post.conversation_id,
                    issuer_id=message_post.issuer_id,
                )
                for media in medias
            ]

        # Convert API model to core model
        message = Message(
            id=str(uuid.uuid4()),
            content=message_post.content,
            conversation_id=message_post.conversation_id,
            issuer_id=message_post.issuer_id,
            timestamp=datetime.now(tz=pytz.timezone("Europe/Paris")),
            reacts=[],
            medias_metadatas=medias_metadas,
        )

        self.messages_store.add_message(message=message)
        logger.info(f"Message {message} successfully added.")
        return MessageResponse(
            id=message.id,
            content=message.content,
            conversation_id=message.conversation_id,
            issuer_id=message.issuer_id,
            timestamp=message.timestamp,
            reacts=[ReactResponse(emoji=react.emoji, issuer_id=react.issuer_id) for react in message.reacts],
            medias_metadatas=[
                MediaMetadataResponse(
                    id=metadata.id,
                    size=metadata.size,
                    issuer_id=metadata.issuer_id,
                    type=metadata.type,
                    timestamp=metadata.timestamp,
                    presigned_url=self.medias_store.generate_presigned_url(metadata),
                )
                for metadata in message.medias_metadatas
            ],
        )

    def update_message(self, message_id: str, message_update: MessageUpdate) -> Message:
        # Get existing message
        existing_message = self.messages_store.get_message(message_id=message_id)

        # Update only provided fields
        existing_message.votes.update(message_update.votes or {})
        existing_message.reacts.extend(message_update.reacts or [])
        existing_message.content = message_update.content or existing_message.content

        self.messages_store.update_message(message=existing_message)
        logger.info(f"Message {message_id} successfully updated.")
        return existing_message

    def _message_to_response(self, message: Message) -> MessageResponse:
        """Convert a core Message to a MessageResponse with presigned URLs."""
        return MessageResponse(
            id=message.id,
            content=message.content,
            conversation_id=message.conversation_id,
            issuer_id=message.issuer_id,
            timestamp=message.timestamp,
            reacts=[ReactResponse(emoji=react.emoji, issuer_id=react.issuer_id) for react in message.reacts],
            medias_metadatas=[
                MediaMetadataResponse(
                    id=metadata.id,
                    size=metadata.size,
                    issuer_id=metadata.issuer_id,
                    type=metadata.type,
                    timestamp=metadata.timestamp,
                    presigned_url=self.medias_store.generate_presigned_url(metadata),
                )
                for metadata in message.medias_metadatas
            ],
            votes=message.votes,
        )

    def get_messages(self, conversation_id: str) -> list[MessageResponse]:
        messages = self.messages_store.get_messages(conversation_id=conversation_id)
        return [self._message_to_response(message) for message in messages]

    def media_exists(self, media_metadata: MediaMetadata) -> bool:
        return self.medias_store.media_exists(media_metadata)

    def delete_media(self, media_metadata: MediaMetadata) -> bool:
        return self.medias_store.delete_media(media_metadata)

    def add_react(self, react_post: ReactPost, message_id: str):
        # Convert API model to core model
        react = React(
            emoji=react_post.emoji,
            issuer_id=react_post.issuer_id,
        )
        self.messages_store.add_react(react=react, message_id=message_id)

    def delete_conversation(self, user_id: str, conversation_id: str) -> None:
        self.conversations_store.delete_conversation(user_id=user_id, conversation_id=conversation_id)

    def leave_conversation(self, user_id: str, conversation_id: str) -> Conversation:
        return self.conversations_store.leave_conversation(user_id=user_id, conversation_id=conversation_id)

    def update_conversation_user(
        self,
        conversation_id: str,
        user_id: str,
        pseudo: str | None = None,
        smiley: str | None = None,
    ) -> ConversationUser:
        """Update user data in a conversation"""
        return self.conversations_store.update_conversation_user(
            conversation_id=conversation_id,
            user_id=user_id,
            pseudo=pseudo,
            smiley=smiley,
        )

    def get_conversation_user(self, conversation_id: str, user_id: str) -> ConversationUser | None:
        """Get user data for a specific user in a conversation"""
        return self.conversations_store.get_conversation_user(conversation_id=conversation_id, user_id=user_id)

    def find_message_by_media_id(self, media_id: str) -> Message | None:
        """Find a message that contains media with the given ID"""
        return self.messages_store.find_message_by_media_id(media_id=media_id)

    def get_message(self, message_id: str) -> Message:
        """Get a message by its ID"""
        return self.messages_store.get_message(message_id=message_id)
