from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class User(BaseModel):
    id: str
    username: str
    password_hash: str | None = None
    auth_provider: str = "local"  # "local" or "google"
    google_id: str | None = None
    pseudo: str | None = None
    location: str | None = None
    badges: dict[str, int] = Field(default_factory=dict)  # badge name -> cumulative earn count


class React(BaseModel):
    emoji: str
    issuer_id: str


class MediaMetadata(BaseModel):
    id: str
    uri: str
    key: str
    size: int | float
    type: Literal["image", "video", "audio"]
    issuer_id: str
    timestamp: datetime
    transcription: str | None = None


class Message(BaseModel):
    id: str
    content: str
    conversation_id: str
    issuer_id: str
    timestamp: datetime
    reacts: list[React]
    medias_metadatas: list[MediaMetadata]
    votes: dict[str, str] = {}  # VoterId -> VotedForId
    message_type: Literal["text", "media", "voice", "drawing"] = "text"


class ConversationUser(BaseModel):
    user_id: str
    pseudo: str | None = None
    smiley: str | None = None
    last_message_at: dict[str, datetime | None] = Field(
        default_factory=lambda: {"media": None, "voice": None, "drawing": None},
    )  # message type -> last send time (per-type cooldown)
    timer_warning_dismissed: bool = False


class Conversation(BaseModel):
    id: str
    users: dict[str, ConversationUser]
    name: str
    is_locked: bool
    is_visible: bool
    admin_id: str
    analysis: dict | None = None
    reveal_ready_user_ids: list[str] = Field(default_factory=list)
    is_revealed: bool = False
    analysis_status: Literal["idle", "running", "done", "failed"] = "idle"
