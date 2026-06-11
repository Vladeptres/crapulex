import math
import random
import string
import uuid
from datetime import datetime, timedelta
from typing import Any

import chat_analyser.core.analyser as analyser_module

import pytz
from loguru import logger

from core import config
from core.badges import BADGES, badges_with_levels

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
from core.transcription import transcribe_audio
from core.users_store import UsersStore
from core.utils import check_db_connection

check_db_connection()

COOLDOWN_MESSAGE_TYPES = ("media", "voice", "drawing")


class CooldownActiveError(Exception):
    """Raised when a user tries to send a message type that is still on cooldown."""

    def __init__(self, message_type: str, retry_after_seconds: int):
        self.message_type = message_type
        self.retry_after_seconds = retry_after_seconds
        super().__init__(
            f"Message type '{message_type}' is on cooldown for another {retry_after_seconds} seconds",
        )


def _as_utc(dt: datetime) -> datetime:
    """Normalize a datetime to aware UTC (Mongo returns naive UTC datetimes)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=pytz.UTC)
    return dt.astimezone(pytz.UTC)


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

    def _infer_message_type(self, message_post: MessagePost, medias: list[Any] | None) -> str:
        """Resolve the message type from the request, falling back to media content type."""
        if message_post.message_type:
            return message_post.message_type
        if medias:
            for media in medias:
                content_type = getattr(media, "content_type", "") or ""
                if content_type.startswith("audio/"):
                    return "voice"
            return "media"
        return "text"

    def get_cooldowns(self, conversation_id: str, user_id: str) -> dict[str, int]:
        """Return remaining cooldown seconds per message type for a user (0 = available)."""
        conversation_user = self.conversations_store.get_conversation_user(
            conversation_id=conversation_id,
            user_id=user_id,
        )
        now = datetime.now(tz=pytz.UTC)
        cooldowns = {}
        for message_type in COOLDOWN_MESSAGE_TYPES:
            last_sent = (conversation_user.last_message_at or {}).get(message_type) if conversation_user else None
            if last_sent is None:
                cooldowns[message_type] = 0
                continue
            elapsed = now - _as_utc(last_sent)
            remaining = timedelta(seconds=config.MESSAGE_COOLDOWN_SECONDS) - elapsed
            cooldowns[message_type] = max(0, int(remaining.total_seconds()))
        return cooldowns

    def add_message(self, message_post: MessagePost, medias: list[Any] | None = None) -> MessageResponse:
        conversation = self.conversations_store.get_conversation(message_post.conversation_id)
        if message_post.issuer_id not in conversation.users:
            raise ValueError(
                f"User {message_post.issuer_id} is not among registered user of "
                f"conversation {message_post.conversation_id}",
            )

        message_type = self._infer_message_type(message_post, medias)

        # Enforce per-type 30-minute cooldown
        if message_type in COOLDOWN_MESSAGE_TYPES:
            remaining = self.get_cooldowns(
                conversation_id=message_post.conversation_id,
                user_id=message_post.issuer_id,
            )[message_type]
            if remaining > 0:
                raise CooldownActiveError(message_type=message_type, retry_after_seconds=remaining)

        medias_metadas = []
        if medias:
            for media in medias:
                metadata = self.medias_store.upload_media(
                    uploaded_file=media,
                    conversation_id=message_post.conversation_id,
                    issuer_id=message_post.issuer_id,
                )
                # Transcribe voice messages on the fly (Mistral Voxtral)
                if metadata.type == "audio":
                    metadata.transcription = transcribe_audio(media)
                medias_metadas.append(metadata)

        # Convert API model to core model
        message = Message(
            id=str(uuid.uuid4()),
            content=message_post.content,
            conversation_id=message_post.conversation_id,
            issuer_id=message_post.issuer_id,
            timestamp=datetime.now(tz=pytz.timezone("Europe/Paris")),
            reacts=[],
            medias_metadatas=medias_metadas,
            message_type=message_type,
        )

        self.messages_store.add_message(message=message)

        # Start the cooldown window for this type
        if message_type in COOLDOWN_MESSAGE_TYPES:
            self.conversations_store.set_last_message_at(
                conversation_id=message_post.conversation_id,
                user_id=message_post.issuer_id,
                message_type=message_type,
                timestamp=datetime.now(tz=pytz.UTC),
            )

        logger.info(f"Message {message} successfully added.")
        return self._message_to_response(message)

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
                    transcription=metadata.transcription,
                )
                for metadata in message.medias_metadatas
            ],
            votes=message.votes,
            message_type=message.message_type,
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
        timer_warning_dismissed: bool | None = None,
    ) -> ConversationUser:
        """Update user data in a conversation"""
        return self.conversations_store.update_conversation_user(
            conversation_id=conversation_id,
            user_id=user_id,
            pseudo=pseudo,
            smiley=smiley,
            timer_warning_dismissed=timer_warning_dismissed,
        )

    def get_conversation_user(self, conversation_id: str, user_id: str) -> ConversationUser | None:
        """Get user data for a specific user in a conversation"""
        return self.conversations_store.get_conversation_user(conversation_id=conversation_id, user_id=user_id)

    def mark_reveal_ready(self, conversation_id: str, user_id: str) -> tuple[int, int, bool]:
        """Mark a user as ready to reveal. Returns (ready_count, member_count, is_revealed).

        Fires the reveal permanently once >= 50% of current members are ready.
        """
        conversation = self.conversations_store.get_conversation(conversation_id=conversation_id)
        if not conversation.is_locked:
            raise ValueError("Conversation must be locked before revealing")
        if user_id not in conversation.users:
            raise ValueError(f"User {user_id} is not a member of conversation {conversation_id}")

        if conversation.is_revealed:
            ready_count = len(conversation.reveal_ready_user_ids)
            return ready_count, len(conversation.users), True

        self.conversations_store.add_reveal_ready_user(conversation_id=conversation_id, user_id=user_id)
        conversation = self.conversations_store.get_conversation(conversation_id=conversation_id)

        # Only count members still in the conversation
        ready_ids = [uid for uid in conversation.reveal_ready_user_ids if uid in conversation.users]
        member_count = len(conversation.users)
        threshold = math.ceil(member_count / 2)
        is_revealed = len(ready_ids) >= threshold
        if is_revealed:
            self.conversations_store.set_revealed(conversation_id=conversation_id)
            logger.info(f"Reveal triggered for conversation {conversation_id} ({len(ready_ids)}/{member_count})")
        return len(ready_ids), member_count, is_revealed

    def get_reveal_status(self, conversation_id: str, user_id: str) -> dict:
        """Return the live reveal readiness state for a conversation."""
        conversation = self.conversations_store.get_conversation(conversation_id=conversation_id)
        ready_ids = [uid for uid in conversation.reveal_ready_user_ids if uid in conversation.users]
        return {
            "ready_count": len(ready_ids),
            "member_count": len(conversation.users),
            "is_revealed": conversation.is_revealed,
            "user_is_ready": user_id in ready_ids,
        }

    def award_badge(self, user_id: str, badge: str) -> None:
        """Increment a user's cumulative badge count (one badge per party)."""
        self.users_store.users_collection.update_one(
            {"id": user_id},
            {"$inc": {f"badges.{badge}": 1}},
        )
        logger.info(f"Awarded badge '{badge}' to user {user_id}")

    def get_user_profile(self, user_id: str) -> dict:
        """Build the profile payload: badges with levels, past parties, simple stats."""
        user = self.users_store.get_user(user_id=user_id)
        if not user:
            raise KeyError(f"User {user_id} not found")

        conversations = self.conversations_store.get_conversations(user_id=user_id)
        total_messages = self.messages_store.messages_collection.count_documents({"issuer_id": user_id})

        return {
            "id": user.id,
            "username": user.username,
            "pseudo": user.pseudo,
            "badges": badges_with_levels(user.badges),
            "past_parties": [{"id": c.id, "name": c.name, "is_locked": c.is_locked} for c in conversations],
            "total_messages": total_messages,
            "parties_attended": len(conversations),
        }

    def run_analysis(self, conversation_id: str) -> dict:
        """Run the chat analyser synchronously and store results on the conversation.

        Returns the raw analysis dict (keyed by pseudo). Intended to be called
        from a background thread via asyncio.to_thread().
        """
        conversation = self.conversations_store.get_conversation(conversation_id=conversation_id)
        messages = self.messages_store.get_messages(conversation_id=conversation_id)

        # Build pseudo → user_id mapping and list of known pseudos
        pseudo_to_user_id: dict[str, str] = {}
        for uid, cu in conversation.users.items():
            pseudo = cu.pseudo or self.users_store.get_user(user_id=uid).username if uid else None
            if pseudo:
                pseudo_to_user_id[pseudo] = uid

        user_list = list(pseudo_to_user_id.keys())

        # Build messages list with pseudo as "user" key
        uid_to_pseudo = {uid: pseudo for pseudo, uid in pseudo_to_user_id.items()}
        formatted_messages = []
        for msg in messages:
            pseudo = uid_to_pseudo.get(msg.issuer_id, msg.issuer_id)
            content_parts = []
            if msg.content:
                content_parts.append(msg.content)
            for media in msg.medias_metadatas or []:
                if media.transcription:
                    content_parts.append(f"[voice: {media.transcription}]")
                elif media.type == "image":
                    kind = getattr(msg, "message_type", "media")
                    content_parts.append(f"[{kind if kind else 'photo'}]")
                elif media.type == "audio":
                    content_parts.append("[voice message]")
            if not content_parts:
                continue
            formatted_messages.append({"user": pseudo, "content": " ".join(content_parts)})

        if not formatted_messages:
            logger.info(f"No messages to analyse for conversation {conversation_id}")
            return {}

        try:
            result = analyser_module.analyse_chat(
                context_type="party",
                users=user_list,
                messages=formatted_messages,
                pseudo_to_user_id=pseudo_to_user_id,
            )
        except Exception as e:
            logger.error(f"Analysis failed for conversation {conversation_id}: {e}")
            raise

        # Award badges (one per user per party)
        already_awarded: set[str] = set()
        for pseudo, feedback in result.users_feedback.items():
            badge_name = feedback.badge
            if not badge_name or badge_name not in BADGES:
                logger.warning(f"Unknown badge '{badge_name}' for {pseudo} — skipping award")
                continue
            user_id = pseudo_to_user_id.get(pseudo)
            if not user_id or user_id in already_awarded:
                continue
            self.award_badge(user_id=user_id, badge=badge_name)
            already_awarded.add(user_id)
            logger.info(f"Awarded '{badge_name}' to {pseudo} ({user_id})")

        # Store analysis in conversation
        analysis_dict = result.model_dump()
        conversation_update = ConversationUpdate(analysis=analysis_dict, analysis_status="done")
        self.update_conversation(conversation_id=conversation_id, conversation_update=conversation_update)
        logger.info(f"Analysis complete for conversation {conversation_id}")
        return analysis_dict

    def find_message_by_media_id(self, media_id: str) -> Message | None:
        """Find a message that contains media with the given ID"""
        return self.messages_store.find_message_by_media_id(media_id=media_id)

    def get_message(self, message_id: str) -> Message:
        """Get a message by its ID"""
        return self.messages_store.get_message(message_id=message_id)
