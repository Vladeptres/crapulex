import json
import os
import random
import string
import time
from pathlib import Path

import boto3
import requests
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, tag
from moto import mock_aws

from core.config import S3_BUCKET_NAME


def set_up_mock_s3():
    s3_client = boto3.client(
        "s3",
        region_name="eu-north-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",  # noqa: S106
    )
    # Create the mock bucket
    s3_client.create_bucket(
        Bucket=S3_BUCKET_NAME,
        CreateBucketConfiguration={"LocationConstraint": "eu-north-1"},
    )


class ConversationsApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.api_prefix = "/api/"

    def test_register_and_login(self):
        payload = {"username": "alice", "password": "secret123"}
        resp = self.client.post(
            f"{self.api_prefix}register/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        user = resp.json()
        self.assertTrue(user)

        # Try login
        resp = self.client.post(f"{self.api_prefix}login/", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("username", resp.json())
        self.assertEqual(resp.json()["username"], "alice")

        # Get users
        resp = self.client.get(f"{self.api_prefix}users", query_params={"users_ids": [user["id"]]})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()[0]["username"], "alice")

    def test_create_conversation(self):
        # Register user
        payload = {"username": "bob", "password": "secret456"}
        resp = self.client.post(
            f"{self.api_prefix}register/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        user = resp.json()
        self.assertTrue(user)
        user_id = user["id"]
        # Create conversation (minimal required fields)
        conversation = {"name": "Test"}
        resp = self.client.post(
            f"{self.api_prefix}chat/",
            data=json.dumps(conversation),
            content_type="application/json",
            HTTP_USER_ID=user_id,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("id", resp.json())
        conversation_id = resp.json()["id"]
        self.assertTrue(conversation_id)

    def test_join_leave_conversation(self):
        # Register two users
        payload1 = {"username": "user1", "password": "pw1"}
        payload2 = {"username": "user2", "password": "pw2"}
        resp = self.client.post(
            f"{self.api_prefix}register/",
            data=json.dumps(payload1),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        user_id1 = resp.json()["id"]
        resp = self.client.post(
            f"{self.api_prefix}register/",
            data=json.dumps(payload2),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        user_id2 = resp.json()["id"]
        # Create conversation with user1
        conversation = {"name": "TestJoin", "is_locked": False}
        resp = self.client.post(
            f"{self.api_prefix}chat/",
            data=json.dumps(conversation),
            content_type="application/json",
            HTTP_USER_ID=user_id1,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["users_ids"], [user_id1])
        self.assertEqual(resp.json()["name"], "TestJoin")
        self.assertEqual(resp.json()["admin_id"], user_id1)
        conversation_id = resp.json()["id"]
        # Join conversation with user2
        resp = self.client.post(
            f"{self.api_prefix}chat/{conversation_id}/join",
            content_type="application/json",
            HTTP_USER_ID=user_id2,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("users_ids", resp.json())
        self.assertEqual(resp.json()["users_ids"], [user_id1, user_id2])
        # Join again with user1 (idempotent)
        resp = self.client.post(
            f"{self.api_prefix}chat/{conversation_id}/join",
            content_type="application/json",
            HTTP_USER_ID=user_id1,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("users_ids", resp.json())
        self.assertCountEqual(resp.json()["users_ids"], [user_id1, user_id2])

        resp = self.client.get(
            f"{self.api_prefix}users",
            query_params={"users_ids": [user_id1, user_id2]},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 2)
        self.assertEqual(resp.json()[0]["username"], "user1")
        self.assertEqual(resp.json()[0]["id"], user_id1)
        self.assertEqual(resp.json()[1]["username"], "user2")
        self.assertEqual(resp.json()[1]["id"], user_id2)

        # User1 leaves conversation
        resp = self.client.delete(
            f"{self.api_prefix}chat/{conversation_id}/leave",
            HTTP_USER_ID=user_id1,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["users_ids"], [user_id2])
        self.assertEqual(resp.json()["admin_id"], user_id2)

        # User2 try to leave conversation
        resp = self.client.delete(
            f"{self.api_prefix}chat/{conversation_id}/leave",
            HTTP_USER_ID=user_id2,
        )
        self.assertEqual(resp.status_code, 422)

        # User2 deletes conversation
        resp = self.client.delete(
            f"{self.api_prefix}chat/{conversation_id}/",
            HTTP_USER_ID=user_id2,
        )
        self.assertEqual(resp.status_code, 200)

    def test_post_message(self):
        # Register user
        payload = {"username": "msguser", "password": "pwmsg"}
        resp = self.client.post(
            f"{self.api_prefix}register/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        user_id = resp.json()["id"]
        # Create conversation
        conversation = {"name": "MsgTest", "is_locked": False}
        resp = self.client.post(
            f"{self.api_prefix}chat/",
            data=json.dumps(conversation),
            content_type="application/json",
            HTTP_USER_ID=user_id,
        )
        self.assertEqual(resp.status_code, 200)
        conversation_id = resp.json()["id"]
        # Post message
        msg = {"content": "Hello world!", "issuer_id": user_id, "conversation_id": conversation_id}
        resp = self.client.post(
            f"{self.api_prefix}chat/{conversation_id}/messages/",
            data={"message": json.dumps(msg)},
            HTTP_USER_ID=user_id,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["content"], "Hello world!")

    @mock_aws
    def test_post_message_with_media(self):
        set_up_mock_s3()
        """Test posting a message with video, photo and mp3 attachment using real test data."""
        # Register user
        payload = {"username": "videouser", "password": "pwvid"}
        resp = self.client.post(
            f"{self.api_prefix}register/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        user_id = resp.json()["id"]

        # Create conversation
        conversation = {"name": "MediaTest", "is_locked": False}
        resp = self.client.post(
            f"{self.api_prefix}chat/",
            data=json.dumps(conversation),
            content_type="application/json",
            HTTP_USER_ID=user_id,
        )
        self.assertEqual(resp.status_code, 200)
        conversation_id = resp.json()["id"]

        # Load file from test data
        test_data_dir = Path(__file__).parent.parent / "tests" / "test_data"
        for i, media_file in enumerate(os.listdir(test_data_dir)):
            media_path = test_data_dir / media_file

            with media_path.open("rb") as f:
                media_content = f.read()

            uploaded_file = SimpleUploadedFile(name=media_file, content=media_content, content_type="video/mp4")

            msg_data = {"content": f"Message {i}", "issuer_id": user_id, "conversation_id": conversation_id}

            resp = self.client.post(
                f"{self.api_prefix}chat/{conversation_id}/messages/",
                data={
                    "message": json.dumps(msg_data),
                    "medias": [uploaded_file],
                },
                HTTP_USER_ID=user_id,
            )

            self.assertEqual(resp.status_code, 200)
            response_data = resp.json()
            self.assertEqual(response_data["content"], f"Message {i}")
            self.assertEqual(len(response_data["medias_metadatas"]), 1)

            media_metadata = response_data["medias_metadatas"][0]
            self.assertEqual(media_metadata["type"], "video")
            self.assertEqual(media_metadata["size"], len(media_content))
            self.assertEqual(media_metadata["issuer_id"], user_id)
            self.assertIn("presigned_url", media_metadata)
            self.assertIn("id", media_metadata)
            self.assertIn("timestamp", media_metadata)

        # Get messages
        resp = self.client.get(
            f"{self.api_prefix}chat/{conversation_id}/messages/",
            HTTP_USER_ID=user_id,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 3)
        for message in resp.json():
            self.assertIn("id", message)
            self.assertIn("timestamp", message)
            self.assertIn("medias_metadatas", message)
            for media_metadata in message["medias_metadatas"]:
                self.assertIn("presigned_url", media_metadata)
                response = requests.get(media_metadata["presigned_url"])  # noqa: S113
                self.assertEqual(response.status_code, 200)

    def test_media_upload_error_handling(self):
        """Test error handling for media uploads."""
        # Register user
        payload = {"username": "erroruser", "password": "pwerror"}
        resp = self.client.post(
            f"{self.api_prefix}register/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        user_id = resp.json()["id"]

        # Create conversation
        conversation = {"name": "ErrorTest", "is_locked": False}
        resp = self.client.post(
            f"{self.api_prefix}chat/",
            data=json.dumps(conversation),
            content_type="application/json",
            HTTP_USER_ID=user_id,
        )
        self.assertEqual(resp.status_code, 200)
        conversation_id = resp.json()["id"]

        # Test with unsupported file type
        unsupported_file = SimpleUploadedFile(
            name="test.txt",
            content=b"This is a text file",
            content_type="text/plain",
        )

        msg_data = {
            "content": "Message with unsupported file",
            "issuer_id": user_id,
            "conversation_id": conversation_id,
        }

        resp = self.client.post(
            f"{self.api_prefix}chat/{conversation_id}/messages/",
            data={"message": json.dumps(msg_data), "medias": [unsupported_file]},
            HTTP_USER_ID=user_id,
        )

        # Should return error for unsupported file type
        self.assertEqual(resp.status_code, 422)
        self.assertIn("error", resp.json())

    def test_full_conversation_flow(self):
        # Register two users
        payload1 = {"username": "flowuser1", "password": "pwflow1"}
        payload2 = {"username": "flowuser2", "password": "pwflow2"}
        resp = self.client.post(
            f"{self.api_prefix}register/",
            data=json.dumps(payload1),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        user_id1 = resp.json()["id"]
        resp = self.client.post(
            f"{self.api_prefix}register/",
            data=json.dumps(payload2),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        user_id2 = resp.json()["id"]
        # Create conversation with user1
        conversation = {"name": "TestMeta", "is_locked": False}
        resp = self.client.post(
            f"{self.api_prefix}chat/",
            data=json.dumps(conversation),
            content_type="application/json",
            HTTP_USER_ID=user_id1,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["users_ids"], [user_id1])
        conversation_id = resp.json()["id"]

        # Get users
        resp = self.client.get(
            f"{self.api_prefix}users",
            query_params={"users_ids": [user_id1]},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()[0]["username"], "flowuser1")
        # Join conversation (should be idempotent)
        join_url = f"{self.api_prefix}chat/{conversation_id}/join"
        resp = self.client.post(join_url, content_type="application/json", HTTP_USER_ID=user_id2)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["users_ids"], [user_id1, user_id2])
        # Post message

        msg = {"content": "Hello world!", "conversation_id": conversation_id, "issuer_id": user_id2}
        resp = self.client.post(
            f"{self.api_prefix}chat/{conversation_id}/messages/",
            data={"message": json.dumps(msg)},
            HTTP_USER_ID=user_id2,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["content"], "Hello world!")
        # Update conversation

        meta = {"name": "conv name", "is_locked": False}
        resp = self.client.patch(
            f"{self.api_prefix}chat/{conversation_id}",
            data=json.dumps(meta),
            content_type="application/json",
            HTTP_USER_ID=user_id2,
        )
        self.assertEqual(resp.status_code, 200)
        # Get messages
        resp = self.client.get(f"{self.api_prefix}chat/{conversation_id}/messages/", HTTP_USER_ID=user_id2)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(isinstance(resp.json(), list))
        self.assertIn("Hello world!", json.dumps(resp.json()))
        # Get conversation
        resp = self.client.get(f"{self.api_prefix}chat/{conversation_id}", HTTP_USER_ID=user_id2)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("name", resp.json())
        self.assertEqual(resp.json()["name"], "conv name")
        # List conversations for user

        resp = self.client.get(f"{self.api_prefix}chat/", HTTP_USER_ID=user_id2)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(len(resp.json()) == 1)
        self.assertTrue("conv name" in resp.json()[0]["name"])
        # React to message
        patch_message_url = f"{self.api_prefix}chat/{conversation_id}"
        get_messages_url = f"{self.api_prefix}chat/{conversation_id}/messages/"
        messages = self.client.get(get_messages_url)
        message_id = messages.json()[0]["id"]
        resp = self.client.patch(
            patch_message_url,
            data=json.dumps({"id": message_id, "reacts": [{"emoji": "👍", "issuer_id": user_id2}]}),
            content_type="application/json",
            HTTP_USER_ID=user_id2,
        )
        self.assertEqual(resp.status_code, 200)
        messages = self.client.get(get_messages_url)
        self.assertEqual(messages.status_code, 200)
        self.assertTrue(isinstance(messages.json(), list))

    @tag("slow")
    def test_messages_retrieval_performance(self):
        """Performance test for message retrieval with large dataset."""
        # Register multiple users
        users = []
        for username in ["Alice", "Bob", "Tristan", "Julien", "Paul"]:
            payload = {"username": username, "password": "coucou"}
            resp = self.client.post(
                f"{self.api_prefix}register/",
                data=json.dumps(payload),
                content_type="application/json",
            )
            self.assertEqual(resp.status_code, 200)
            users.append(resp.json())

        # Create multiple conversations
        conversation_ids = []
        for i in range(5):
            conversation = {"name": f"conv_{i}"}
            resp = self.client.post(
                f"{self.api_prefix}chat/",
                data=json.dumps(conversation),
                content_type="application/json",
                HTTP_USER_ID=users[0]["id"],
            )
            self.assertEqual(resp.status_code, 200)
            conversation_ids.append(resp.json()["id"])

        # Join all users to all conversations
        for user in users[1:]:
            for conversation_id in conversation_ids:
                resp = self.client.post(
                    f"{self.api_prefix}chat/{conversation_id}/join",
                    content_type="application/json",
                    HTTP_USER_ID=user["id"],
                )
                self.assertEqual(resp.status_code, 200)

        # Create many messages across all conversations and users
        for i in range(20):
            for user in users:
                for conversation_id in conversation_ids:
                    message_content = f"message_{i}_" + "".join(
                        random.choices(string.ascii_letters + string.digits, k=50 * 7),  # noqa: S311
                    )
                    message = {
                        "content": message_content,
                        "conversation_id": conversation_id,
                        "issuer_id": user["id"],
                    }
                    resp = self.client.post(
                        f"{self.api_prefix}chat/{conversation_id}/messages/",
                        data={"message": json.dumps(message)},
                        HTTP_USER_ID=user["id"],
                    )
                    self.assertEqual(resp.status_code, 200)

        # Performance test: measure message retrieval time
        t0 = time.perf_counter()
        resp = self.client.get(
            f"{self.api_prefix}chat/{conversation_ids[0]}/messages/",
            HTTP_USER_ID=users[0]["id"],
        )
        t1 = time.perf_counter()

        self.assertEqual(resp.status_code, 200)
        retrieved_messages = resp.json()
        self.assertTrue(isinstance(retrieved_messages, list))

        retrieval_time = round(t1 - t0, 5)
        print(f"\n{retrieval_time} s to fetch {len(retrieved_messages)} messages")  # noqa: T201

        # Assert that we have the expected number of messages (20 messages * 5 users = 100 messages per conversation)
        self.assertEqual(len(retrieved_messages), 100)

        # Performance assertion: should complete within reasonable time (adjust threshold as needed)
        self.assertLess(retrieval_time, 5.0, f"Message retrieval took {retrieval_time}s, which is too slow")
