from datetime import datetime
from typing import Literal
from pydantic import Field, BaseModel, field_validator


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

class ReactPost(BaseModel):
    """Schema for posting reactions"""
    emoji: str
    issuer_id: str

class MessageUpdate(BaseModel):
    """Schema for updating messages"""
    id: str
    content: str = None
    reacts: list[ReactPost] = None
    votes: dict[str, str] = None  # VoterId -> VotedForId


class ConversationUser(BaseModel):
    """Schema for user data within a conversation"""
    user_id: str
    pseudo: str | None = None
    smiley: str | None = None


class ConversationUserUpdate(BaseModel):
    """Schema for updating user data in a conversation"""
    pseudo: str | None = None
    smiley: str | None = None


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
    presigned_url: str = None


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
    votes: dict[str, str] = Field(default_factory=dict)  # VoterId -> VotedForId


class ConversationResponse(BaseModel):
    """Schema for conversation data in responses"""
    id: str
    users: dict[str, ConversationUser]
    name: str
    is_locked: bool
    is_visible: bool
    admin_id: str


class ConversationUserResponse(BaseModel):
    """Schema for user data in conversation responses"""
    user_id: str
    pseudo: str | None = None
    smiley: str | None = None


class SuccessResponse(BaseModel):
    """Generic success response schema"""
    message: str
    data: dict | None = None
