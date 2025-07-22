from loguru import logger
from ninja import File, NinjaAPI
from ninja.files import UploadedFile
from pydantic import ValidationError

from api.config import MONGO_DB_NAME
from api.models import (
    ConversationCreate,
    ConversationResponse,
    ConversationUpdate,
    ErrorResponse,
    MessagePost,
    MessageResponse,
    MessageUpdate,
    ReactPost,
    UserCredentials,
    UserResponse,
)
from core.stores_registry import StoresRegistry

registry = StoresRegistry(db_name=MONGO_DB_NAME)

api = NinjaAPI()


@api.post("register/", response={200: UserResponse, 401: ErrorResponse, 500: ErrorResponse})
def register_user(request, user_credentials: UserCredentials):
    logger.info("Received request to register user.")
    try:
        user = registry.register_user(user_credentials=user_credentials)
        logger.info(f"User registered with id: {user.id}")
        return 200, UserResponse(id=user.id, username=user.username, pseudo=user.pseudo, location=user.location)
    except KeyError:
        logger.error(f"User with username {user_credentials.username} already exists")
        return 401, {"error": f"User with username {user_credentials.username} already exists"}
    except Exception as e:
        logger.error(f"Unexpected error during user registration: {e}")
        return 500, {"error": str(e)}


@api.post("login/", response={200: UserResponse, 401: ErrorResponse, 500: ErrorResponse})
def login(request, user_credentials: UserCredentials):
    logger.info("Received request to login user.")
    try:
        user_id = registry.check_credentials(user_credentials=user_credentials)
        if not user_id:
            logger.error(f"Credentials don't match for username {user_credentials.username}")
            return 401, {"error": f"Credentials don't match for username {user_credentials.username}"}
        logger.info(f"User with id {user_id} logged in.")
        user = registry.get_user(user_id=user_id)
        return 200, UserResponse(id=user.id, username=user.username, pseudo=user.pseudo, location=user.location)
    except ValueError as e:
        return 401, {"error": str(e)}
    except KeyError:
        logger.error(f"Credentials don't match for username {user_credentials.username}")
        return 401, {"error": f"Username {user_credentials.username} not found in database"}
    except Exception as e:
        logger.error(f"Unexpected error during user login: {e}")
        return 500, {"error": str(e)}


@api.post("chat/", response={200: ConversationResponse, 422: ErrorResponse, 500: ErrorResponse})
def create_conversation(request, conversation: ConversationCreate):
    user_id = request.headers.get("user_id") or request.headers.get("User-Id")
    logger.info("Received request to create conversation.")
    try:
        conversation_id = registry.create_conversation(user_id=user_id, conversation_create=conversation)
        logger.info(f"Conversation created with id: {conversation_id}")
        created_conversation = registry.get_conversation(conversation_id=conversation_id)
        return 200, ConversationResponse(
            id=created_conversation.id,
            users_ids=created_conversation.users_ids,
            name=created_conversation.name,
            is_locked=created_conversation.is_locked,
            is_visible=created_conversation.is_visible,
        )
    except ValidationError as ve:
        logger.warning(f"Validation error during conversation creation: {ve}")
        return 422, {"error": f"Validation error: {ve}"}
    except Exception as e:
        logger.error(f"Unexpected error during conversation creation: {e}")
        return 500, {"error": str(e)}


@api.post("chat/{conversation_id}/join", response={200: ConversationResponse, 500: ErrorResponse})
def join_conversation(request, conversation_id: str):
    user_id = request.headers.get("user_id") or request.headers.get("User-Id")
    try:
        logger.info(f"Received request to join conversation {conversation_id} for user {user_id}.")
        registry.join_conversation(user_id=user_id, conversation_id=conversation_id)
        logger.info(f"User {user_id} joined conversation {conversation_id}.")
        conversation = registry.get_conversation(conversation_id=conversation_id)
        return 200, ConversationResponse(
            id=conversation.id,
            users_ids=conversation.users_ids,
            name=conversation.name,
            is_locked=conversation.is_locked,
            is_visible=conversation.is_visible,
        )
    except Exception as e:
        logger.error(f"Error joining conversation {conversation_id}: {e}")
        return 500, {"error": str(e)}


@api.post("chat/{conversation_id}/messages/", response={200: MessageResponse, 422: ErrorResponse, 500: ErrorResponse})
def post_message(request, conversation_id: str, message: MessagePost, medias: File[list[UploadedFile] | None] = None):
    user_id = request.headers.get("user_id") or request.headers.get("User-Id")
    try:
        logger.info(f"Received request to post message to conversation {conversation_id}.")
        message_post = MessagePost(
            content=message.content,
            conversation_id=conversation_id,
            issuer_id=user_id,
        )
        created_message = registry.add_message(message_post=message_post, medias=medias)
        logger.info(f"Message posted to conversation {conversation_id}.")
        return 200, created_message
    except (ValueError, ValidationError) as ve:
        logger.warning(f"Validation error posting message to {conversation_id}: {ve}")
        return 422, {"error": f"Validation error: {ve}"}
    except Exception as e:
        logger.error(f"Unexpected error posting message to {conversation_id}: {e}")
        return 500, {"error": str(e)}


@api.patch("chat/{conversation_id}", response={200: ConversationResponse, 422: ErrorResponse, 500: ErrorResponse})
def patch_conversation(request, conversation_id: str, conversation: ConversationUpdate):
    request.headers.get("user_id") or request.headers.get("User-Id")
    logger.info(f"Received request to update metadata for conversation {conversation_id}.")
    try:
        registry.update_conversation(conversation_id=conversation_id, conversation_update=conversation)
        logger.info(f"Metadata updated for conversation {conversation_id}.")

        result_conversation = registry.get_conversation(conversation_id=conversation_id)
        return 200, ConversationResponse(
            id=result_conversation.id,
            users_ids=result_conversation.users_ids,
            name=result_conversation.name,
            is_locked=result_conversation.is_locked,
            is_visible=result_conversation.is_visible,
        )
    except ValidationError as ve:
        logger.warning(f"Validation error updating metadata for {conversation_id}: {ve}")
        return 422, {"error": f"Validation error: {ve}"}
    except Exception as e:
        logger.error(f"Unexpected error updating metadata for {conversation_id}: {e}")
        return 500, {"error": str(e)}


@api.get("chat/{conversation_id}/messages/", response={200: list[MessageResponse], 500: ErrorResponse})
def get_messages(request, conversation_id: str):
    try:
        logger.info(f"Received request to get messages for conversation {conversation_id}.")
        messages_responses = registry.get_messages(conversation_id=conversation_id)
        logger.info(f"Fetched {len(messages_responses)} messages.")
        return 200, messages_responses
    except Exception as e:
        logger.error(f"Error fetching messages for conversation {conversation_id}: {e}")
        return 500, {"error": str(e)}


@api.get("chat/{conversation_id}", response={200: ConversationResponse, 500: ErrorResponse})
def get_conversation(request, conversation_id: str):
    try:
        logger.info(f"Received request to get metadata for conversation {conversation_id}.")
        conversation = registry.get_conversation(conversation_id=conversation_id)
        logger.info(f"Fetched metadata for conversation {conversation_id}.")
        return 200, ConversationResponse(
            id=conversation.id,
            users_ids=conversation.users_ids,
            name=conversation.name,
            is_locked=conversation.is_locked,
            is_visible=conversation.is_visible,
        )
    except Exception as e:
        logger.error(f"Error fetching metadata for conversation {conversation_id}: {e}")
        return 500, {"error": str(e)}


@api.get("/users", response={200: list[UserResponse], 500: ErrorResponse})
def get_users(request):
    logger.info("Received request to get users.")
    users_ids = request.GET.getlist("users_ids", "*")
    logger.info(f"Received request to get users for user_ids {users_ids}.")
    try:
        users = registry.get_users(user_ids=users_ids)
        logger.info(f"Fetched {len(users)} users for user_ids {users_ids}.")
        return 200, [
            UserResponse(id=user.id, username=user.username, pseudo=user.pseudo, location=user.location)
            for user in users
        ]
    except Exception as e:
        logger.error(f"Error fetching users for user_ids {users_ids}: {e}")
        return 500, {"error": str(e)}


@api.get("chat/", response={200: list[ConversationResponse], 500: ErrorResponse})
def list_conversations(request):
    user_id = request.headers.get("user_id") or request.headers.get("User-Id")
    try:
        logger.info("Received request to list all conversations.")
        conversations = registry.list_conversations(user_id=user_id)
        logger.info(f"Fetched {len(conversations)} conversations.")

        conversation_responses = [
            ConversationResponse(
                id=conv.id,
                users_ids=conv.users_ids,
                name=conv.name,
                is_locked=conv.is_locked,
                is_visible=conv.is_visible,
            )
            for conv in conversations
        ]

        return 200, conversation_responses
    except Exception as e:
        logger.error(f"Error listing conversations: {e}")
        return 500, {"error": str(e)}


@api.patch("chat/{conversation_id}/messages", response={200: MessageResponse, 500: ErrorResponse})
def patch_message(request, conversation_id: str, message: MessageUpdate):
    if not message.id:
        raise ValueError("Message id is required to update message")
    try:
        logger.info(f"Received request to update message {message.id} for conversation {conversation_id}.")

        if message.reacts:
            react_post = ReactPost(emoji=message.reacts[0].emoji, issuer_id=message.reacts[0].issuer_id)
            registry.add_react(react_post=react_post, message_id=message.id)

        result_message = registry.update_message(message_id=message.id, message_update=message)
        logger.info(f"Message {message.id} updated for conversation {conversation_id}.")

        return 200, MessageResponse(
            id=result_message.id,
            content=result_message.content,
            conversation_id=result_message.conversation_id,
            issuer_id=result_message.issuer_id,
            timestamp=result_message.timestamp,
            reacts=[],
            medias_metadatas=[],
        )
    except Exception as e:
        logger.error(f"Error updating message {message.id} for conversation {conversation_id}: {e}")
        return 500, {"error": str(e)}
