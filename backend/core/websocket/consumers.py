import json
import os

from channels.generic.websocket import AsyncWebsocketConsumer

from api.config import MONGO_DB_NAME
from api.models import MessagePost
from core.stores_registry import StoresRegistry


class ChatConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, db_name: str | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        # Use environment variable if set, otherwise use provided db_name or default
        effective_db_name = os.environ.get("MONGO_DB_NAME", db_name or MONGO_DB_NAME)
        self.stores_registry = StoresRegistry(db_name=effective_db_name)

    async def connect(self):
        # Extract conversation_id from scope - handle both WebsocketCommunicator and manual test scenarios
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
            message["conversation_id"] = self.conversation_id
            message = MessagePost.model_validate(message)
            self.stores_registry.add_message(message)
            # Relay message to group
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "chat_message",
                    "message": message.model_dump(),
                },
            )
        else:
            raise ValueError(f"Unknown message type: {message_type}")

    # Receive message from room group
    async def chat_message(self, event):
        # Extract the message data from the event
        message_data = event["message"]
        await self.send(text_data=json.dumps(message_data))
