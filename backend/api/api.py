from pathlib import Path

import chat_analyser
from channels.layers import get_channel_layer
from django.http import FileResponse, Http404, HttpResponse
from loguru import logger
from ninja import File, NinjaAPI
from ninja.files import UploadedFile
from pydantic import ValidationError

from api.config import MONGO_DB_NAME
from api.models import (
    ConversationCreate,
    ConversationResponse,
    ConversationUpdate,
    ConversationUserResponse,
    ConversationUserUpdate,
    ErrorResponse,
    MessagePost,
    MessageResponse,
    MessageUpdate,
    SuccessResponse,
    UserCredentials,
    UserResponse,
)
from core.stores_registry import StoresRegistry

registry = StoresRegistry(db_name=MONGO_DB_NAME)

api = NinjaAPI()


@api.post("health/", response={200: dict, 500: ErrorResponse})
def health_check(request):
    return 200, {"message": "OK"}


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
        return 200, UserResponse(**user.model_dump())
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
        return 200, ConversationResponse(**created_conversation.model_dump())
    except ValidationError as ve:
        logger.warning(f"Validation error during conversation creation: {ve}")
        return 422, {"error": f"Validation error: {ve}"}
    except Exception as e:
        logger.error(f"Unexpected error during conversation creation: {e}")
        return 500, {"error": str(e)}


@api.post("chat/{conversation_id}/join", response={200: ConversationResponse, 500: ErrorResponse})
async def join_conversation(request, conversation_id: str):
    user_id = request.headers.get("user_id") or request.headers.get("User-Id")
    try:
        logger.info(f"Received request to join conversation {conversation_id} for user {user_id}.")
        registry.join_conversation(user_id=user_id, conversation_id=conversation_id)
        logger.info(f"User {user_id} joined conversation {conversation_id}.")

        # Get updated conversation data after join
        conversation = registry.get_conversation(conversation_id=conversation_id)
        user_data = conversation.users.get(user_id)

        # Check if user needs an emoji assignment
        is_new_user = not user_data or not user_data.smiley
        assigned_emoji = None

        if is_new_user:
            import random

            # List of fun emojis to randomly assign
            available_emojis = [
                "😀",
                "😃",
                "😄",
                "😁",
                "😆",
                "😅",
                "🤣",
                "😂",
                "🙂",
                "🙃",
                "😉",
                "😊",
                "😇",
                "🥰",
                "😍",
                "🤩",
                "😘",
                "😗",
                "😚",
                "😙",
                "😋",
                "😛",
                "😜",
                "🤪",
                "😝",
                "🤑",
                "🤗",
                "🤭",
                "🤫",
                "🤔",
                "🤐",
                "🤨",
                "😐",
                "😑",
                "😶",
                "😏",
                "😒",
                "🙄",
                "😬",
                "🤥",
                "😌",
                "😔",
                "😪",
                "🤤",
                "😴",
                "😷",
                "🤒",
                "🤕",
                "🤢",
                "🤮",
                "🤧",
                "🥵",
                "🥶",
                "🥴",
                "😵",
                "🤯",
                "🤠",
                "🥳",
                "😎",
                "🤓",
                "🧐",
                "😕",
                "😟",
                "🙁",
                "☹️",
                "😮",
                "😯",
                "😲",
                "😳",
                "🥺",
                "😦",
                "😧",
                "😨",
                "😰",
                "😥",
                "😢",
                "😭",
                "😱",
                "😖",
                "😣",
                "😞",
                "😓",
                "😩",
                "😫",
                "🥱",
                "😤",
                "😡",
                "😠",
                "🤬",
                "😈",
                "👿",
                "💀",
                "☠️",
                "💩",
                "🤡",
                "👹",
                "👺",
                "👻",
                "👽",
                "👾",
                "🤖",
                "🎃",
                "😺",
                "😸",
                "😹",
                "😻",
                "😼",
                "😽",
                "🙀",
                "😿",
                "😾",
                "🐶",
                "🐱",
                "🐭",
                "🐹",
                "🐰",
                "🦊",
                "🐻",
                "🐼",
                "🐨",
                "🐯",
                "🦁",
                "🐮",
                "🐷",
                "🐸",
                "🐵",
                "🙈",
                "🙉",
                "🙊",
                "🐒",
            ]

            assigned_emoji = random.choice(available_emojis)

            # Update user with random emoji
            registry.update_conversation_user(
                conversation_id=conversation_id,
                user_id=user_id,
                smiley=assigned_emoji,
            )

            logger.info(
                f"Assigned random emoji '{assigned_emoji}' to new user {user_id} in conversation {conversation_id}",
            )

        # Send websocket notifications to ALL users in the conversation
        channel_layer = get_channel_layer()
        if channel_layer:
            try:
                # Send user join notification to all users in conversation
                await channel_layer.group_send(
                    f"chat_{conversation_id}",
                    {
                        "type": "user_joined",
                        "conversation_id": conversation_id,
                        "user_id": user_id,
                        "assigned_emoji": assigned_emoji,  # Include the assigned emoji
                    },
                )

                # If emoji was assigned, also send user data change notification
                if assigned_emoji:
                    await channel_layer.group_send(
                        f"chat_{conversation_id}",
                        {
                            "type": "user_data_changed",
                            "conversation_id": conversation_id,
                            "user_id": user_id,
                            "smiley": assigned_emoji,
                            "changed_by": "system",
                        },
                    )

            except Exception as ws_error:
                logger.warning(f"Failed to send websocket notifications for user join in {conversation_id}: {ws_error}")

        # Return updated conversation data
        updated_conversation = registry.get_conversation(conversation_id=conversation_id)
        return 200, ConversationResponse(**updated_conversation.model_dump())
    except Exception as e:
        logger.error(f"Error joining conversation {conversation_id}: {e}")
        return 500, {"error": str(e)}


@api.post("chat/{conversation_id}/messages/", response={200: MessageResponse, 422: ErrorResponse, 500: ErrorResponse})
async def post_message(
    request,
    conversation_id: str,
    message: MessagePost,
    medias: File[list[UploadedFile] | None] = None,
):
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

        # Send websocket notification for new message
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                # Convert message to JSON-serializable format
                message_dict = created_message.model_dump()
                # Convert datetime objects to ISO format strings
                if message_dict.get("timestamp"):
                    message_dict["timestamp"] = (
                        message_dict["timestamp"].isoformat()
                        if hasattr(message_dict["timestamp"], "isoformat")
                        else str(message_dict["timestamp"])
                    )
                if message_dict.get("created_at"):
                    message_dict["created_at"] = (
                        message_dict["created_at"].isoformat()
                        if hasattr(message_dict["created_at"], "isoformat")
                        else str(message_dict["created_at"])
                    )
                if message_dict.get("updated_at"):
                    message_dict["updated_at"] = (
                        message_dict["updated_at"].isoformat()
                        if hasattr(message_dict["updated_at"], "isoformat")
                        else str(message_dict["updated_at"])
                    )

                # Convert media metadata timestamps to ISO format strings
                if message_dict.get("medias_metadatas"):
                    for media in message_dict["medias_metadatas"]:
                        if media.get("timestamp"):
                            media["timestamp"] = (
                                media["timestamp"].isoformat()
                                if hasattr(media["timestamp"], "isoformat")
                                else str(media["timestamp"])
                            )

                await channel_layer.group_send(
                    f"chat_{conversation_id}",
                    {
                        "type": "chat_message",
                        "message": message_dict,
                    },
                )
                logger.info(f"Sent new message notification for conversation {conversation_id}")
        except Exception as ws_error:
            logger.warning(f"Failed to send websocket notification for new message in {conversation_id}: {ws_error}")

        return 200, created_message
    except (ValueError, ValidationError) as ve:
        logger.warning(f"Validation error posting message to {conversation_id}: {ve}")
        return 422, {"error": f"Validation error: {ve}"}
    except Exception as e:
        logger.error(f"Unexpected error posting message to {conversation_id}: {e}")
        return 500, {"error": str(e)}


@api.patch("chat/{conversation_id}", response={200: ConversationResponse, 422: ErrorResponse, 500: ErrorResponse})
async def patch_conversation(request, conversation_id: str, conversation: ConversationUpdate):
    user_id = request.headers.get("user_id") or request.headers.get("User-Id")
    logger.info(f"Received request to update metadata for conversation {conversation_id}.")
    try:
        # Get the old conversation to check if name changed
        old_conversation = registry.get_conversation(conversation_id=conversation_id)
        old_name = old_conversation.name

        registry.update_conversation(conversation_id=conversation_id, conversation_update=conversation)
        logger.info(f"Metadata updated for conversation {conversation_id}.")

        result_conversation = registry.get_conversation(conversation_id=conversation_id)

        # Send WebSocket notifications for any conversation changes
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                # Check what changed and send appropriate notifications
                old_locked = old_conversation.is_locked
                old_visible = old_conversation.is_visible

                # Name change notification
                if conversation.name and conversation.name != old_name:
                    await channel_layer.group_send(
                        f"chat_{conversation_id}",
                        {
                            "type": "conversation_name_changed",
                            "conversation_id": conversation_id,
                            "new_name": conversation.name,
                            "changed_by": user_id,
                        },
                    )
                    logger.info(f"Sent conversation name change notification for {conversation_id}")

                # Lock state change notification
                if conversation.is_locked is not None and conversation.is_locked != old_locked:
                    await channel_layer.group_send(
                        f"chat_{conversation_id}",
                        {
                            "type": "conversation_lock_changed",
                            "conversation_id": conversation_id,
                            "is_locked": conversation.is_locked,
                            "changed_by": user_id,
                        },
                    )
                    logger.info(f"Sent conversation lock change notification for {conversation_id}")

                # Visibility state change notification
                if conversation.is_visible is not None and conversation.is_visible != old_visible:
                    await channel_layer.group_send(
                        f"chat_{conversation_id}",
                        {
                            "type": "conversation_visibility_changed",
                            "conversation_id": conversation_id,
                            "is_visible": conversation.is_visible,
                            "changed_by": user_id,
                        },
                    )
                    logger.info(f"Sent conversation visibility change notification for {conversation_id}")

        except Exception as ws_error:
            # Log websocket error but don't fail the entire request
            logger.warning(f"Failed to send websocket notification for {conversation_id}: {ws_error}")

        return 200, ConversationResponse(**result_conversation.model_dump())
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
        return 200, ConversationResponse(**conversation.model_dump())
    except Exception as e:
        logger.error(f"Error fetching metadata for conversation {conversation_id}: {e}")
        return 500, {"error": str(e)}


@api.get("users", response={200: list[UserResponse], 500: ErrorResponse})
def get_users(request):
    logger.info("Received request to get users.")
    users_ids = request.GET.getlist("users_ids", "*")
    logger.info(f"Received request to get users for user_ids {users_ids}.")
    try:
        users = registry.get_users(user_ids=users_ids)
        logger.info(f"Fetched {len(users)} users for user_ids {users_ids}.")
        return 200, [UserResponse(**user.model_dump()) for user in users]
    except Exception as e:
        logger.error(f"Error fetching users for user_ids {users_ids}: {e}")
        return 500, {"error": str(e)}


@api.get("chat/", response={200: list[ConversationResponse], 500: ErrorResponse})
def get_conversations(request):
    user_id = request.headers.get("user_id") or request.headers.get("User-Id")
    try:
        logger.info("Received request to list all conversations.")
        conversations = registry.get_conversations(user_id=user_id)
        logger.info(f"Fetched {len(conversations)} conversations.")

        conversation_responses = [ConversationResponse(**conv.model_dump()) for conv in conversations]

        return 200, conversation_responses
    except Exception as e:
        logger.error(f"Error listing conversations: {e}")
        return 500, {"error": str(e)}


@api.patch("chat/{conversation_id}/messages", response={200: MessageResponse, 500: ErrorResponse})
async def patch_message(request, conversation_id: str, message: MessageUpdate):
    if not message.id:
        raise ValueError("Message id is required to update message")
    try:
        user_id = request.headers.get("user_id") or request.headers.get("User-Id")
        logger.info(f"Received request to update message {message.id} for conversation {conversation_id}.")

        result_message = registry.update_message(message_id=message.id, message_update=message)
        logger.info(f"Message {message.id} updated for conversation {conversation_id}.")

        # Send WebSocket notification for updates
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                # Convert message to JSON-serializable format using Pydantic
                message_dict = result_message.model_dump(mode="json")

                # Send appropriate notification based on what was updated
                if message.votes is not None:
                    await channel_layer.group_send(
                        f"chat_{conversation_id}",
                        {
                            "type": "message_vote_updated",
                            "conversation_id": conversation_id,
                            "message_id": message.id,
                            "message": message_dict,
                            "changed_by": user_id,
                        },
                    )
                    logger.info(f"Sent message vote update notification for {message.id}")
                elif message.reacts:
                    await channel_layer.group_send(
                        f"chat_{conversation_id}",
                        {
                            "type": "message_reaction_updated",
                            "conversation_id": conversation_id,
                            "message_id": message.id,
                            "message": message_dict,
                            "changed_by": user_id,
                        },
                    )
                    logger.info(f"Sent message reaction update notification for {message.id}")
        except Exception as ws_error:
            logger.error(f"Failed to send WebSocket notification for message update: {ws_error}")

        return 200, MessageResponse(**result_message.model_dump())
    except Exception as e:
        logger.error(f"Error updating message {message.id} for conversation {conversation_id}: {e}")
        return 500, {"error": str(e)}


@api.delete(
    "chat/{conversation_id}/leave",
    response={200: ConversationResponse, 422: ErrorResponse, 500: ErrorResponse},
)
def leave_conversation(request, conversation_id):
    user_id = request.headers.get("user_id") or request.headers.get("User-Id")
    try:
        logger.info(f"Received request to leave conversation {conversation_id} from user {user_id}.")
        conversation = registry.leave_conversation(user_id=user_id, conversation_id=conversation_id)
        logger.info(f"User {user_id} left conversation {conversation_id}.")
        return 200, ConversationResponse(**conversation.model_dump())
    except ValueError as ve:
        logger.warning(f"Error leaving conversation {conversation_id} from user {user_id}: {ve}")
        return 422, {"error": f"Validation error: {ve}"}
    except Exception as e:
        logger.error(f"Error leaving conversation {conversation_id} from user {user_id}: {e}")
        return 500, {"error": str(e)}


@api.delete("chat/{conversation_id}/", response={200: SuccessResponse, 500: ErrorResponse})
def delete_conversation(request, conversation_id: str):
    user_id = request.headers.get("user_id") or request.headers.get("User-Id")
    try:
        logger.info(f"Received request to delete conversation {conversation_id}.")
        registry.delete_conversation(user_id=user_id, conversation_id=conversation_id)
        logger.info(f"Conversation {conversation_id} deleted.")
        return 200, SuccessResponse(
            message="Conversation deleted successfully",
            data={"conversation_id": conversation_id},
        )
    except Exception as e:
        logger.error(f"Error deleting conversation {conversation_id}: {e}")
        return 500, {"error": str(e)}


@api.post(
    "chat/{conversation_id}/user",
    response={200: ConversationUserResponse, 422: ErrorResponse, 500: ErrorResponse},
)
def create_conversation_user(request, conversation_id: str, user_data: ConversationUserUpdate):
    current_user_id = request.headers.get("user_id") or request.headers.get("User-Id")
    try:
        logger.info(
            f"Received request to create/update user data for user {current_user_id} in conversation {conversation_id}.",
        )
        updated_user = registry.update_conversation_user(
            conversation_id=conversation_id,
            user_id=current_user_id,
            pseudo=user_data.pseudo,
            smiley=user_data.smiley,
        )
        logger.info(f"User data created/updated for user {current_user_id} in conversation {conversation_id}.")
        return 200, ConversationUserResponse(
            user_id=current_user_id,
            pseudo=updated_user.pseudo,
            smiley=updated_user.smiley,
        )
    except Exception as e:
        logger.error(
            f"Error creating/updating user data for user {current_user_id} in conversation {conversation_id}: {e}",
        )
        return 500, {"error": str(e)}


@api.patch(
    "chat/{conversation_id}/user/{target_user_id}",
    response={200: ConversationUserResponse, 422: ErrorResponse, 500: ErrorResponse},
)
async def update_conversation_user(
    request,
    conversation_id: str,
    target_user_id: str,
    user_data: ConversationUserUpdate,
):
    current_user_id = request.headers.get("user_id") or request.headers.get("User-Id")
    try:
        logger.info(
            f"Received request from user {current_user_id} to update user data for user {target_user_id} in conversation {conversation_id}.",
        )

        # Handle empty string as deletion for both pseudo and smiley
        pseudo = user_data.pseudo if user_data.pseudo != "" else None
        smiley = user_data.smiley if user_data.smiley != "" else None

        updated_user = registry.update_conversation_user(
            conversation_id=conversation_id,
            user_id=target_user_id,
            pseudo=pseudo,
            smiley=smiley,
        )

        # Send websocket notification for user data changes
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                await channel_layer.group_send(
                    f"chat_{conversation_id}",
                    {
                        "type": "user_data_changed",
                        "conversation_id": conversation_id,
                        "user_id": target_user_id,
                        "pseudo": updated_user.pseudo,
                        "smiley": updated_user.smiley,
                        "changed_by": current_user_id,
                    },
                )
        except Exception as ws_error:
            logger.warning(
                f"Failed to send websocket notification for user data change in {conversation_id}: {ws_error}",
            )

        logger.info(f"User data updated for user {current_user_id} in conversation {conversation_id}.")
        return 200, ConversationUserResponse(
            user_id=current_user_id,
            pseudo=updated_user.pseudo,
            smiley=updated_user.smiley,
        )
    except Exception as e:
        logger.error(f"Error updating user data for user {current_user_id} in conversation {conversation_id}: {e}")
        return 500, {"error": str(e)}


@api.get("media/{media_id}")
def serve_media(request, media_id: str):
    """Serve media files from local storage or MinIO"""
    try:
        # Find the message containing this media
        message = registry.find_message_by_media_id(media_id)
        if not message:
            raise Http404("Media not found")

        # Find the specific media in the message
        for media in message.medias_metadatas:
            if media.id == media_id:
                file_extension = Path(media.key).suffix if media.key else ""

                if media.uri.startswith("file://"):
                    file_path = Path(media.uri[7:])  # Remove "file://" prefix
                    if file_path.exists():
                        return FileResponse(
                            open(file_path, "rb"),
                            content_type=f"{media.type}/*",
                            filename=f"{media_id}{file_path.suffix}",
                        )

                elif media.uri.startswith("s3://"):
                    # Stream from MinIO/S3 via the backend
                    content = registry.medias_store.download_media(media)
                    if content:
                        response = HttpResponse(content, content_type=f"{media.type}/*")
                        response["Content-Disposition"] = f'inline; filename="{media_id}{file_extension}"'
                        return response

        raise Http404("Media not found")
    except Http404:
        raise
    except Exception as e:
        logger.error(f"Error serving media {media_id}: {e}")
        raise Http404("Media not found")


@api.get("chat/{conversation_id}/users", response={200: list[ConversationUserResponse], 500: ErrorResponse})
def get_conversation_users(request, conversation_id: str):
    try:
        logger.info(f"Received request to get user data for conversation {conversation_id}.")
        conversation = registry.get_conversation(conversation_id=conversation_id)

        # Create response for all users in conversation
        users_data = []
        for user_id, conversation_user in conversation.users.items():
            users_data.append(
                ConversationUserResponse(
                    user_id=user_id,
                    pseudo=conversation_user.pseudo,
                    smiley=conversation_user.smiley,
                ),
            )

        logger.info(f"Fetched user data for {len(users_data)} users in conversation {conversation_id}.")
        return 200, users_data
    except Exception as e:
        logger.error(f"Error fetching user data for conversation {conversation_id}: {e}")
        return 500, {"error": str(e)}


@api.get(
    "chat/{conversation_id}/analyse",
    response={200: chat_analyser.api.models.ConversationAnalysisResponse, 500: ErrorResponse},
)
def analyse_chat(request, conversation_id: str):
    try:
        logger.info(f"Received request to analyse conversation {conversation_id}.")
        conversation = registry.get_conversation(conversation_id=conversation_id)
        messages = registry.get_messages(conversation_id=conversation_id)
        if not conversation.analysis:
            analyse = chat_analyser.core.analyser.analyse_chat(
                context_type="party",
                users=conversation.users,
                messages=messages,
            )
            conversation.analysis = analyse.model_dump()
            registry.update_conversation(conversation_id=conversation_id, conversation_update=conversation)

        logger.info(f"Analysed conversation {conversation_id}.")
        return 200, chat_analyser.api.models.ConversationAnalysisResponse.model_validate(conversation.analysis)
    except Exception as e:
        logger.error(f"Error analysing conversation {conversation_id}: {e}")
        return 500, {"error": str(e)}
