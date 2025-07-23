from datetime import datetime
from typing import Literal
from pydantic import Field, BaseModel

from core.models import React


# Request Models (for incoming data)
class UserCredentials(BaseModel):
    """Schema for user registration and login requests"""
    username: str
    password: str


class MessagePost(BaseModel):
    """Schema for posting new messages"""
    content: str
    issuer_id: str
    conversation_id: str


class ConversationCreate(BaseModel):
    """Schema for creating new conversations"""
    name: str = "Name me 😘"
    is_locked: bool = False
    is_visible: bool = False


class ConversationUpdate(BaseModel):
    """Schema for updating conversation metadata"""
    name: str = None
    is_locked: bool = None
    is_visible: bool = None
    admin_id: str = None


class MessageUpdate(BaseModel):
    """Schema for updating messages"""
    id: str
    content: str = None
    reacts: list[React] = None


class ReactPost(BaseModel):
    """Schema for posting reactions"""
    emoji: str
    issuer_id: str


# Response Models (for outgoing data)
class ErrorResponse(BaseModel):
    """Standard error response schema"""
    error: str


class UserResponse(BaseModel):
    """Schema for user data in responses"""
    id: str
    username: str
    pseudo: str | None = None
    location: str | None = None


class MediaMetadataResponse(BaseModel):
    """Schema for media metadata in responses"""
    id: str
    size: int | float
    type: Literal["image", "video", "audio"]
    issuer_id: str
    timestamp: datetime
    presigned_url: str


class ReactResponse(BaseModel):
    """Schema for reactions in responses"""
    emoji: str
    issuer_id: str


class MessageResponse(BaseModel):
    """Schema for message data in responses"""
    id: str
    content: str
    conversation_id: str
    issuer_id: str
    timestamp: datetime
    reacts: list[ReactResponse] = Field(default_factory=list)
    medias_metadatas: list[MediaMetadataResponse] = Field(default_factory=list)


class ConversationResponse(BaseModel):
    """Schema for conversation data in responses"""
    id: str
    users_ids: list[str]
    name: str
    is_locked: bool
    is_visible: bool
    admin_id: str


class SuccessResponse(BaseModel):
    """Generic success response schema"""
    message: str
    data: dict | None = None
