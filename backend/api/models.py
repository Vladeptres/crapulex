from datetime import datetime
from typing import Literal
from pydantic import Field, BaseModel, field_validator


# Request Models (for incoming data)
class UserCredentials(BaseModel):
    """Schema for user registration and login requests"""
    username: str
    password: str


class GoogleAuthRequest(BaseModel):
    """Schema for Google OAuth2 authentication"""
    credential: str  # Google ID token


class MessagePost(BaseModel):
    """Schema for posting new messages"""
    content: str
    issuer_id: str
    conversation_id: str
    message_type: Literal["text", "media", "voice", "drawing"] | None = None


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
    analysis: dict = None
    analysis_status: str = None

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
    last_message_at: dict[str, datetime | None] = Field(
        default_factory=lambda: {"media": None, "voice": None, "drawing": None},
    )
    timer_warning_dismissed: bool = False


class ConversationUserUpdate(BaseModel):
    """Schema for updating user data in a conversation"""
    pseudo: str | None = None
    smiley: str | None = None
    timer_warning_dismissed: bool | None = None


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
    badges: dict[str, int] = Field(default_factory=dict)


class MediaMetadataResponse(BaseModel):
    """Schema for media metadata in responses"""
    id: str
    size: int | float
    type: Literal["image", "video", "audio"]
    issuer_id: str
    timestamp: datetime
    presigned_url: str = None
    transcription: str | None = None


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
    message_type: Literal["text", "media", "voice", "drawing"] = "text"


class ConversationResponse(BaseModel):
    """Schema for conversation data in responses"""
    id: str
    users: dict[str, ConversationUser]
    name: str
    is_locked: bool
    is_visible: bool
    admin_id: str
    reveal_ready_user_ids: list[str] = Field(default_factory=list)
    is_revealed: bool = False
    analysis_status: Literal["idle", "running", "done", "failed"] = "idle"


class ConversationUserResponse(BaseModel):
    """Schema for user data in conversation responses"""
    user_id: str
    pseudo: str | None = None
    smiley: str | None = None
    timer_warning_dismissed: bool = False


class CooldownResponse(BaseModel):
    """Per-type cooldown state for the requesting user in a conversation"""
    cooldowns: dict[str, int] = Field(default_factory=dict)  # type -> remaining seconds (0 = available)
    cooldown_duration_seconds: int = 1800


class CooldownErrorResponse(BaseModel):
    """429 response when a message type is still on cooldown"""
    error: str
    message_type: str
    retry_after_seconds: int


class RevealStatusResponse(BaseModel):
    """Live reveal readiness state for a conversation"""
    ready_count: int
    member_count: int
    is_revealed: bool
    user_is_ready: bool


class BadgeInfo(BaseModel):
    """A badge with its computed level"""
    emoji: str
    count: int
    level: int
    description: str = ""


class UserProfileResponse(BaseModel):
    """Schema for the user profile page"""
    id: str
    username: str
    pseudo: str | None = None
    badges: dict[str, BadgeInfo] = Field(default_factory=dict)
    past_parties: list[dict] = Field(default_factory=list)  # [{id, name, is_locked}]
    total_messages: int = 0
    parties_attended: int = 0


class SuccessResponse(BaseModel):
    """Generic success response schema"""
    message: str
    data: dict | None = None


class AnalysisUserFeedback(BaseModel):
    """Per-user entry in the analysis response, keyed by user_id for the frontend"""
    user_id: str
    pseudo: str
    summary: str = ""
    emoji: str = ""
    badge: str = ""
    badge_emoji: str = ""
    wildness_score: int = 0


class AnalysisResponse(BaseModel):
    """Analysis result returned by GET /chat/{id}/analyse"""
    summary: str = ""
    users_feedbacks: list[AnalysisUserFeedback] = Field(default_factory=list)
    party_title: str = ""
    quote_of_the_night: str = ""
    quote_author: str = ""
