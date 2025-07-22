from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class User(BaseModel):
    id: str
    username: str
    password_hash: str
    pseudo: str | None = None
    location: str | None = None


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


class Message(BaseModel):
    id: str
    content: str
    conversation_id: str
    issuer_id: str
    timestamp: datetime
    reacts: list[React]
    medias_metadatas: list[MediaMetadata]


class Conversation(BaseModel):
    id: str
    users_ids: list[str]
    name: str
    is_locked: bool
    is_visible: bool
