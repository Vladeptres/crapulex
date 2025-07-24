import asyncio
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from channels.testing import WebsocketCommunicator
from django.test import TestCase
from pydantic import ValidationError
from pymongo import MongoClient

from api.models import ConversationCreate, UserCredentials
from core.config import MONGO_DB_URL
from core.websocket.consumers import ChatConsumer

os.environ["DJANGO_SETTINGS_MODULE"] = "api.settings"


class TestChatConsumer(TestCase):
    """Test cases for ChatConsumer websocket functionality."""

    def setUp(self):
        self.db_name = "web_socket_test"
        """Set up test fixtures."""
        self.consumer = ChatConsumer(db_name=self.db_name)
        self.consumer.channel_layer = AsyncMock()
        self.consumer.channel_name = "test_channel"
        self.user_1 = self.consumer.stores_registry.register_user(
            UserCredentials(username="test_user", password="test_password"),
        )
        self.user_2 = self.consumer.stores_registry.register_user(
            UserCredentials(username="test_user", password="test_password"),
        )
        self.user_3 = self.consumer.stores_registry.register_user(
            UserCredentials(username="test_user", password="test_password"),
        )
        self.conversation_id = self.consumer.stores_registry.create_conversation(
            self.user_1.id,
            ConversationCreate(name="test_conversation", users_ids=[self.user_1.id, self.user_2.id, self.user_3.id]),
        )
        self.consumer.conversation_id = self.conversation_id
        self.consumer.room_group_name = f"chat_{self.conversation_id}"
        self.consumer.scope = {
            "url_route": {"kwargs": {"conversation_id": self.conversation_id}},
        }

    def tearDown(self):
        """Tear down test fixtures."""
        mongo_client = MongoClient(MONGO_DB_URL)
        mongo_client.drop_database(self.db_name)

    @patch("core.websocket.consumers.StoresRegistry")
    def test_init_creates_stores_registry(self, mock_stores_registry):
        """Test that ChatConsumer initializes with StoresRegistry."""
        consumer = ChatConsumer()
        mock_stores_registry.assert_called_once()
        assert consumer.stores_registry is not None

    @pytest.mark.asyncio
    async def test_connect_joins_room_group(self):
        """Test that connect method joins the room group and accepts connection."""
        # Setup
        self.consumer.channel_layer.group_add = AsyncMock()
        self.consumer.accept = AsyncMock()

        # Execute
        await self.consumer.connect()

        # Assert
        expected_room_name = f"chat_{self.conversation_id}"
        self.consumer.channel_layer.group_add.assert_called_once_with(
            expected_room_name,
            "test_channel",
        )
        self.consumer.accept.assert_called_once()
        assert self.consumer.conversation_id == self.conversation_id
        assert self.consumer.room_group_name == expected_room_name

    @pytest.mark.asyncio
    async def test_disconnect_leaves_room_group(self):
        """Test that disconnect method leaves the room group."""
        # Setup
        self.consumer.conversation_id = self.conversation_id
        self.consumer.room_group_name = f"chat_{self.conversation_id}"
        self.consumer.channel_layer.group_discard = AsyncMock()

        # Execute
        await self.consumer.disconnect(1000)

        # Assert
        self.consumer.channel_layer.group_discard.assert_called_once_with(
            f"chat_{self.conversation_id}",
            "test_channel",
        )

    @pytest.mark.asyncio
    async def test_receive_processes_message_and_relays_to_group(
        self,
    ):
        """Test that receive method processes message and relays to group."""

        self.consumer.conversation_id = self.conversation_id
        self.consumer.room_group_name = f"chat_{self.conversation_id}"
        self.consumer.channel_layer.group_send = AsyncMock()

        # Test message data
        message_data = {
            "content": "Hello, world!",
            "issuer_id": self.user_1.id,
        }

        # Execute
        await self.consumer.receive(json.dumps({"type": "message", "message": message_data}))

        # Assert message was validated and stored
        expected_message_data = message_data.copy()
        expected_message_data["conversation_id"] = self.conversation_id

        # Verify message was added to store
        messages = self.consumer.stores_registry.get_messages(conversation_id=self.conversation_id)
        assert len(messages) == 1
        assert messages[0].content == expected_message_data["content"]
        assert messages[0].issuer_id == expected_message_data["issuer_id"]
        assert messages[0].conversation_id == expected_message_data["conversation_id"]

        # Verify message was sent to group
        self.consumer.channel_layer.group_send.assert_called_once()
        group_send_args = self.consumer.channel_layer.group_send.call_args
        assert group_send_args[0][0] == f"chat_{self.conversation_id}"

    @pytest.mark.asyncio
    async def test_chat_message_sends_to_websocket(self):
        """Test that chat_message method sends message to websocket."""
        # Setup
        self.consumer.send = AsyncMock()
        test_event = {
            "content": "Test message",
            "issuer_id": "user123",
            "conversation_id": self.conversation_id,
        }

        # Execute
        await self.consumer.chat_message({"message": test_event})

        # Assert
        self.consumer.send.assert_called_once_with(
            text_data=json.dumps(test_event),
        )

    @pytest.mark.asyncio
    @patch("core.websocket.consumers.StoresRegistry")
    async def test_receive_with_invalid_message_data(self, mock_stores_registry):
        """Test that receive method handles invalid message data gracefully."""
        # Setup
        mock_messages_store = MagicMock()
        mock_stores_registry.return_value.messages_store = mock_messages_store

        self.consumer.conversation_id = self.conversation_id
        self.consumer.room_group_name = f"chat_{self.conversation_id}"

        # Test with invalid message data (missing required fields)
        invalid_message_data = {"content": "Hello"}

        # Execute and expect validation error
        with pytest.raises(ValidationError, match="validation error"):
            await self.consumer.receive(json.dumps({"type": "message", "message": invalid_message_data}))

        # Assert message was not stored
        mock_messages_store.add_message.assert_not_called()

    @pytest.mark.asyncio
    async def test_websocket_connection_flow(self):
        """Test complete websocket connection flow."""

        # Create communicator with the same db_name to share the database
        communicator = WebsocketCommunicator(
            ChatConsumer.as_asgi(db_name=self.db_name),
            f"/ws/chat/{self.conversation_id}/",
        )

        # Test connection
        connected, _ = await communicator.connect()
        assert connected

        # Test sending message
        message_data = {
            "content": "Integration test message",
            "issuer_id": self.user_1.id,
        }

        # Send message via websocket
        await communicator.send_json_to({"type": "message", "message": message_data})

        # Give some time for the message to be processed
        await asyncio.sleep(0.1)

        # Verify message was processed by checking the database
        stored_messages = self.consumer.stores_registry.get_messages(conversation_id=self.conversation_id)

        assert len(stored_messages) == 1

        new_message = stored_messages[-1]  # Last message should be the new one
        assert new_message.conversation_id == self.conversation_id
        assert new_message.content == message_data["content"]
        assert new_message.issuer_id == message_data["issuer_id"]

        # Clean up
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_multiple_clients_same_conversation(self):
        """Test multiple clients connecting to the same conversation."""

        # Create two communicators for the same conversation
        communicator1 = WebsocketCommunicator(
            ChatConsumer.as_asgi(db_name=self.db_name),
            f"/ws/chat/{self.conversation_id}/",
        )
        communicator2 = WebsocketCommunicator(
            ChatConsumer.as_asgi(db_name=self.db_name),
            f"/ws/chat/{self.conversation_id}/",
        )

        # Connect both clients
        connected1, _ = await communicator1.connect()
        connected2, _ = await communicator2.connect()
        assert connected1
        assert connected2

        # Send message from first client
        message_data = {
            "content": "Message from client 1",
            "issuer_id": self.user_1.id,
        }

        await communicator1.send_json_to({"type": "message", "message": message_data})

        # Both clients should be able to disconnect successfully
        await communicator1.disconnect()
        await communicator2.disconnect()

        messages = self.consumer.stores_registry.get_messages(conversation_id=self.conversation_id)
        assert len(messages) == 1
        assert messages[0].content == message_data["content"]
        assert messages[0].issuer_id == message_data["issuer_id"]
        assert messages[0].conversation_id == self.conversation_id

    @pytest.mark.asyncio
    async def test_websocket_invalid_conversation_id(self):
        """Test websocket connection with invalid conversation ID format."""
        # Create communicator with invalid conversation ID
        communicator = WebsocketCommunicator(
            ChatConsumer.as_asgi(db_name=self.db_name),
            "/ws/chat/invalid-id-with-special-chars!@#/",
        )

        # Connection should still work (URL validation is handled by Django routing)
        connected, _ = await communicator.connect()
        assert connected

        await communicator.disconnect()
