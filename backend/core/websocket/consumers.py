import json
import os

from channels.generic.websocket import AsyncWebsocketConsumer

from api.config import MONGO_DB_NAME
from core.stores_registry import StoresRegistry


class ChatConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, db_name: str | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        # Use environment variable if set, otherwise use provided db_name or default
        effective_db_name = os.environ.get("MONGO_DB_NAME", db_name or MONGO_DB_NAME)
        self.stores_registry = StoresRegistry(db_name=effective_db_name)

    async def connect(self):
        # Extract conversation_id from URL path
        if "path" in self.scope:
            # WebsocketCommunicator provides path
            self.conversation_id = self.scope["path"].split("/")[-2]
        elif "url_route" in self.scope and "kwargs" in self.scope["url_route"]:
            # Manual test setup provides url_route
            self.conversation_id = self.scope["url_route"]["kwargs"]["conversation_id"]
        else:
            raise ValueError("Cannot extract conversation_id from scope")
        self.room_group_name = f"chat_{self.conversation_id}"
        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name,
        )
        await self.accept()

    async def disconnect(self, close_code):  # noqa: ARG002
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name,
        )

    # Receive message from WebSocket
    async def receive(self, text_data: str):
        text_data_json = json.loads(text_data)
        message_type = text_data_json["type"]

        if message_type == "message":
            message = text_data_json["message"]
            username = text_data_json["username"]
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "chat_message",
                    "message": message,
                    "username": username,
                },
            )
        elif message_type == "conversation_name_changed":
            # Handle conversation name change notifications
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "conversation_name_changed",
                    "conversation_id": self.conversation_id,
                    "new_name": text_data_json["new_name"],
                    "changed_by": text_data_json.get("changed_by"),
                },
            )
        elif message_type == "user_data_changed":
            # Handle user data change notifications
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "user_data_changed",
                    "conversation_id": self.conversation_id,
                    "user_id": text_data_json["user_id"],
                    "pseudo": text_data_json.get("pseudo"),
                    "smiley": text_data_json.get("smiley"),
                    "changed_by": text_data_json.get("changed_by"),
                },
            )
        else:
            raise ValueError(f"Unknown message type: {message_type}")

    # Receive message from room group
    async def chat_message(self, event):
        # Extract the message data from the event and wrap it properly
        message_data = event["message"]
        # Send as a proper WebSocket event with type
        await self.send(text_data=json.dumps({"type": "chat_message", "message": message_data}))

    # Handle conversation name change events
    async def conversation_name_changed(self, event):
        # Send conversation name change notification to WebSocket
        await self.send(
            text_data=json.dumps(
                {
                    "type": "conversation_name_changed",
                    "conversation_id": event["conversation_id"],
                    "new_name": event["new_name"],
                    "changed_by": event.get("changed_by"),
                },
            ),
        )

    # Handle user data change events
    async def user_data_changed(self, event):
        # Send user data change notification to WebSocket
        await self.send(
            text_data=json.dumps(
                {
                    "type": "user_data_changed",
                    "conversation_id": event["conversation_id"],
                    "user_id": event["user_id"],
                    "pseudo": event.get("pseudo"),
                    "smiley": event.get("smiley"),
                    "changed_by": event.get("changed_by"),
                },
            ),
        )

    # Handle user join events
    async def user_joined(self, event):
        # Send user join notification to WebSocket
        await self.send(
            text_data=json.dumps(
                {
                    "type": "user_joined",
                    "conversation_id": event["conversation_id"],
                    "user_id": event["user_id"],
                    "assigned_emoji": event.get("assigned_emoji"),
                },
            ),
        )

    # Handle conversation lock change events
    async def conversation_lock_changed(self, event):
        # Send conversation lock change notification to WebSocket
        await self.send(
            text_data=json.dumps(
                {
                    "type": "conversation_lock_changed",
                    "conversation_id": event["conversation_id"],
                    "is_locked": event["is_locked"],
                    "changed_by": event.get("changed_by"),
                },
            ),
        )

    # Handle conversation visibility change events
    async def conversation_visibility_changed(self, event):
        # Send conversation visibility change notification to WebSocket
        await self.send(
            text_data=json.dumps(
                {
                    "type": "conversation_visibility_changed",
                    "conversation_id": event["conversation_id"],
                    "is_visible": event["is_visible"],
                    "changed_by": event.get("changed_by"),
                },
            ),
        )

    # Handle message reaction update events
    async def message_reaction_updated(self, event):
        # Send message reaction update notification to WebSocket
        await self.send(
            text_data=json.dumps(
                {
                    "type": "message_reaction_updated",
                    "conversation_id": event["conversation_id"],
                    "message_id": event["message_id"],
                    "message": event["message"],
                    "changed_by": event.get("changed_by"),
                },
            ),
        )

    # Handle message vote update events
    async def message_vote_updated(self, event):
        # Send message vote update notification to WebSocket
        await self.send(
            text_data=json.dumps(
                {
                    "type": "message_vote_updated",
                    "conversation_id": event["conversation_id"],
                    "message_id": event["message_id"],
                    "message": event["message"],
                    "changed_by": event.get("changed_by"),
                },
            ),
        )
