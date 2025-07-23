import os
import random
import string

import boto3
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from moto import mock_aws
from pymongo import MongoClient

from api.models import ConversationCreate, ConversationUpdate, MessagePost, ReactPost, ReactResponse, UserCredentials
from core.stores_registry import StoresRegistry

MONGO_URL = os.environ.get("MONGO_DB_URL", "mongodb://localhost:27017/")


def random_db_name():
    return "test_bourracho_" + "".join(random.choices(string.ascii_lowercase, k=8))


def drop_database(db_name):
    client = MongoClient(MONGO_URL)
    client.drop_database(db_name)


def set_up_mock_s3():
    s3_client = boto3.client(
        "s3",
        region_name="eu-north-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",
    )
    # Create the mock bucket
    s3_client.create_bucket(
        Bucket="bourracho-test",
        CreateBucketConfiguration={"LocationConstraint": "eu-north-1"},
    )


@pytest.fixture
def stores_registry() -> StoresRegistry:
    db_name = random_db_name()
    store = StoresRegistry(db_name)
    yield store
    drop_database(db_name)


def test_auth(stores_registry: StoresRegistry):
    user_creds = UserCredentials(username="charlie", password="password")
    user = stores_registry.register_user(user_credentials=user_creds)

    authed_user = stores_registry.check_credentials(user_credentials=user_creds)
    assert authed_user == user.id

    wrong_creds = UserCredentials(username="charlie", password="wrong_password")
    authed_user = stores_registry.check_credentials(user_credentials=wrong_creds)
    assert authed_user is None

    retrieved = stores_registry.get_user(user.id)
    assert retrieved.id == user.id
    assert retrieved.username == user.username


def test_conversations(stores_registry: StoresRegistry):
    user1_creds = UserCredentials(username="charlie", password="password")
    user2_creds = UserCredentials(username="alice", password="password")
    user1 = stores_registry.register_user(user_credentials=user1_creds)
    user2 = stores_registry.register_user(user_credentials=user2_creds)

    conv1_create = ConversationCreate(name="Test")
    conv2_create = ConversationCreate(name="Test")
    conv_id = stores_registry.create_conversation(user1.id, conv1_create)
    conv2_id = stores_registry.create_conversation(user1.id, conv2_create)

    conversations = stores_registry.get_conversations(user1.id)
    assert len(conversations) == 2
    assert any(c.id == conv_id for c in conversations)
    assert any(c.id == conv2_id for c in conversations)

    stores_registry.join_conversation(user2.id, conv_id)
    conversations = stores_registry.get_conversations(user2.id)
    assert len(conversations) == 1
    assert any(c.id == conv_id for c in conversations)

    conversations = stores_registry.get_conversations(user1.id)
    assert len(conversations) == 2
    assert any(c.id == conv_id for c in conversations)
    assert any(c.id == conv2_id for c in conversations)

    conv_update = ConversationUpdate(name="Test2", is_locked=True)
    stores_registry.update_conversation(conversation_id=conv_id, conversation_update=conv_update)
    conversation = stores_registry.get_conversation(conv_id)
    assert conversation.id == conv_id
    assert conversation.name == "Test2"
    assert conversation.users_ids == [user1.id, user2.id]


def test_messages(stores_registry: StoresRegistry):
    user1_creds = UserCredentials(username="charlie", password="password")
    user2_creds = UserCredentials(username="alice", password="password")
    user1 = stores_registry.register_user(user_credentials=user1_creds)
    user2 = stores_registry.register_user(user_credentials=user2_creds)

    conv_create = ConversationCreate(name="Test")
    conv2_create = ConversationCreate(name="Test2")
    # Create and join conversations
    conv1_id = stores_registry.create_conversation(user1.id, conv_create)
    conv2_id = stores_registry.create_conversation(user1.id, conv2_create)
    stores_registry.join_conversation(user1.id, conv1_id)
    stores_registry.join_conversation(user2.id, conv1_id)

    # User 1 post a first message to conv 1 and react to it
    message_post = MessagePost(content="Hello !", conversation_id=conv1_id, issuer_id=user1.id)
    stores_registry.add_message(message_post=message_post)
    assert len(stores_registry.get_messages(conv1_id)) == 1
    assert stores_registry.get_messages(conv1_id)[0].content == "Hello !"

    react_post = ReactPost(emoji="👍", issuer_id=user1.id)
    stores_registry.add_react(react_post=react_post, message_id=stores_registry.get_messages(conv1_id)[0].id)
    assert stores_registry.get_messages(conv1_id)[0].content == "Hello !"
    assert stores_registry.get_messages(conv1_id)[0].reacts == [ReactResponse(emoji="👍", issuer_id=user1.id)]

    # User 2 adds a message to conv 1
    message_post2 = MessagePost(content="Hello back 🤩", conversation_id=conv1_id, issuer_id=user2.id)
    stores_registry.add_message(message_post=message_post2)
    conv1_messages = stores_registry.get_messages(conv1_id)
    assert len(conv1_messages) == 2
    assert conv1_messages[0].content == "Hello !"
    assert conv1_messages[1].content == "Hello back 🤩"

    # User 1 overrides it react
    react_post2 = ReactPost(emoji="🤩", issuer_id=user1.id)
    stores_registry.add_react(react_post=react_post2, message_id=conv1_messages[0].id)
    conv1_messages = stores_registry.get_messages(conv1_id)
    assert conv1_messages[0].reacts == [ReactResponse(emoji="🤩", issuer_id=user1.id)]

    # User 1 adds a message to conv 2
    message_post3 = MessagePost(content="Hello conv 2!", conversation_id=conv2_id, issuer_id=user1.id)
    stores_registry.add_message(message_post=message_post3)
    conv2_messages = stores_registry.get_messages(conv2_id)
    assert len(conv2_messages) == 1
    assert conv2_messages[0].content == "Hello conv 2!"

    # User 2 reacts to conv 1
    react_post3 = ReactPost(emoji="👍", issuer_id=user2.id)
    stores_registry.add_react(react_post=react_post3, message_id=conv1_messages[0].id)
    conv1_messages = stores_registry.get_messages(conv1_id)
    assert conv1_messages[0].reacts[0].emoji == "🤩"
    assert conv1_messages[0].reacts[1].emoji == "👍"


@mock_aws
def test_media_upload_retrieval(stores_registry: StoresRegistry):
    """Test MediaStore integration with message storage."""
    # Create users and conversation
    set_up_mock_s3()
    user1_creds = UserCredentials(username="media_user1", password="password")
    user1 = stores_registry.register_user(user_credentials=user1_creds)
    conv_create = ConversationCreate(name="Media Test")
    conv_id = stores_registry.create_conversation(user1.id, conv_create)

    test_file = SimpleUploadedFile(
        name="message_image.png",
        content=b"test image for message",
        content_type="image/png",
    )
    message_post = MessagePost(
        content="Check out this image!",
        conversation_id=conv_id,
        issuer_id=user1.id,
    )
    stores_registry.add_message(message_post=message_post, medias=[test_file])

    # Retrieve and verify
    messages = stores_registry.get_messages(conv_id)
    assert len(messages) == 1

    retrieved_message = messages[0]
    assert retrieved_message.content == "Check out this image!"
    assert len(retrieved_message.medias_metadatas) == 1
    assert retrieved_message.medias_metadatas[0].type == "image"
    assert retrieved_message.medias_metadatas[0].issuer_id == user1.id
    assert retrieved_message.medias_metadatas[0].timestamp is not None
    assert retrieved_message.medias_metadatas[0].presigned_url is not None


def test_leave_conversation(stores_registry: StoresRegistry):
    """Test leaving a conversation."""
    # Create users
    user1_creds = UserCredentials(username="user1", password="password")
    user2_creds = UserCredentials(username="user2", password="password")
    user1 = stores_registry.register_user(user_credentials=user1_creds)
    user2 = stores_registry.register_user(user_credentials=user2_creds)

    # Create conversation with user1 as admin
    conv_create = ConversationCreate(name="Test Leave")
    conv_id = stores_registry.create_conversation(user1.id, conv_create)

    # Add user2 to conversation
    stores_registry.join_conversation(user2.id, conv_id)

    # Verify both users are in conversation
    conversation = stores_registry.get_conversation(conv_id)
    assert user1.id in conversation.users_ids
    assert user2.id in conversation.users_ids
    assert len(conversation.users_ids) == 2

    # User2 leaves conversation
    stores_registry.leave_conversation(user2.id, conv_id)

    # Verify user2 is no longer in conversation
    conversation = stores_registry.get_conversation(conv_id)
    assert user1.id in conversation.users_ids
    assert user2.id not in conversation.users_ids
    assert len(conversation.users_ids) == 1

    # Test error case: user not in conversation
    with pytest.raises(ValueError, match="User is not in conversation"):
        stores_registry.leave_conversation(user2.id, conv_id)


def test_delete_conversation(stores_registry: StoresRegistry):
    """Test deleting a conversation."""
    # Create users
    admin_creds = UserCredentials(username="admin", password="password")
    user_creds = UserCredentials(username="user", password="password")
    admin = stores_registry.register_user(user_credentials=admin_creds)
    user = stores_registry.register_user(user_credentials=user_creds)

    # Create conversation with admin as admin
    conv_create = ConversationCreate(name="Test Delete")
    conv_id = stores_registry.create_conversation(admin.id, conv_create)

    # Add user to conversation
    stores_registry.join_conversation(user.id, conv_id)

    # Verify conversation exists
    conversation = stores_registry.get_conversation(conv_id)
    assert conversation.id == conv_id
    assert conversation.admin_id == admin.id

    # Test error case: non-admin trying to delete
    with pytest.raises(ValueError, match="User is not admin of conversation"):
        stores_registry.delete_conversation(user.id, conv_id)

    # Admin deletes conversation
    stores_registry.delete_conversation(admin.id, conv_id)

    # Verify conversation is deleted (should raise exception when trying to get it)
    with pytest.raises((ValueError, AttributeError), match=".*"):
        stores_registry.get_conversation(conv_id)
