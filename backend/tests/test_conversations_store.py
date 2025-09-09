from unittest.mock import MagicMock, patch

import pytest

from core.conversations_store import ConversationsStore
from core.models import Conversation

from core.config import MONGO_DB_NAME

MONGO_TEST_DB = MONGO_DB_NAME


@pytest.fixture
def store():
    with patch("core.conversations_store.MongoClient"):
        instance = ConversationsStore(db_name=MONGO_TEST_DB)
        yield instance


def test_create_conversation_validates_and_inserts(store):
    conversation = MagicMock(spec=Conversation)
    conversation.model_dump.return_value = {"foo": "bar"}
    with (
        patch.object(store, "conversations_collection") as mock_coll,
        patch("core.conversations_store.Conversation.model_validate") as mock_validate,
    ):
        store.add_conversation(conversation)
        mock_validate.assert_called_once_with(conversation)
        mock_coll.insert_one.assert_called_once_with(conversation.model_dump())


def test_get_conversation_returns_validated(store):
    fake_conv = {"id": "cid"}
    with (
        patch.object(store, "conversations_collection") as mock_coll,
        patch("core.conversations_store.Conversation.model_validate", side_effect=lambda x: x),
    ):
        mock_coll.find_one.return_value = fake_conv
        result = store.get_conversation("cid")
        assert result == fake_conv
        mock_coll.find_one.assert_called_once_with({"id": "cid"})


def test_get_conversations_returns_list(store):
    fake_convs = [{"id": "cid", "users_ids": ["uid"]}]
    with (
        patch.object(store, "conversations_collection") as mock_coll,
        patch("core.conversations_store.Conversation.model_validate", side_effect=lambda x: x),
    ):
        mock_coll.find.return_value = fake_convs
        result = store.get_conversations("uid")
        assert result == fake_convs
        mock_coll.find.assert_called_once_with({"users_ids": {"$in": ["uid"]}})


def test_add_user_id_to_conversation(store):
    with patch.object(store, "conversations_collection") as mock_coll:
        store.add_user_id_to_conversation("uid", "cid")
        mock_coll.update_one.assert_called_once_with({"id": "cid"}, {"$addToSet": {"users_ids": "uid"}})


def test_leave_conversation_success(store):
    fake_conv = MagicMock(spec=Conversation)
    fake_conv.users_ids = ["user1", "user2"]
    fake_conv.admin_id = "user1"
    with (
        patch.object(store, "get_conversation", return_value=fake_conv) as mock_get,
        patch.object(store, "conversations_collection"),
    ):
        result = store.leave_conversation("user1", "conv1")
        mock_get.assert_called_once_with("conv1")
        assert result == fake_conv
        assert "user1" not in fake_conv.users_ids
        assert fake_conv.admin_id == "user2"


def test_delete_conversation_success(store):
    fake_conv = MagicMock(spec=Conversation)
    fake_conv.admin_id = "admin1"
    with (
        patch.object(store, "get_conversation", return_value=fake_conv) as mock_get,
        patch.object(store, "conversations_collection") as mock_coll,
    ):
        store.delete_conversation("admin1", "conv1")
        mock_get.assert_called_once_with("conv1")
        mock_coll.delete_one.assert_called_once_with({"id": "conv1"})


def test_delete_conversation_user_not_admin(store):
    fake_conv = MagicMock(spec=Conversation)
    fake_conv.admin_id = "admin1"
    with (
        patch.object(store, "get_conversation", return_value=fake_conv),
        pytest.raises(ValueError, match="User is not admin of conversation"),
    ):
        store.delete_conversation("user1", "conv1")
