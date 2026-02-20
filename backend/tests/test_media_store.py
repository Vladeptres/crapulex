from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

from core.medias_store import MediasStore
from core.models import MediaMetadata


class MockUploadedFile:
    """Mock uploaded file to replace Django's SimpleUploadedFile."""

    def __init__(self, name: str, content: bytes, content_type: str | None = None):
        self.name = name
        self.content = content
        self.content_type = content_type
        self.size = len(content)
        self._chunks = [content]

    def chunks(self):
        """Return file content in chunks."""
        return iter(self._chunks)

    def read(self):
        """Read file content."""
        return self.content

    def seek(self, position):
        """Seek to position (mock implementation)."""


class TestMediasStore:
    """Mock tests for MediasStore class."""

    @pytest.fixture
    def mock_s3_client(self):
        """Create a mock S3 client."""
        mock_client = MagicMock()
        mock_client.upload_fileobj.return_value = None
        mock_client.generate_presigned_url.return_value = "https://example.com/presigned-url"
        return mock_client

    @pytest.fixture
    def media_store(self, mock_s3_client):
        """Create a MediasStore with mocked S3 client."""
        with patch("core.medias_store.client", return_value=mock_s3_client):
            store = MediasStore()
            store.s3_client = mock_s3_client
            store._bucket_name = "test-bucket"
            store._backend = "minio"
            yield store

    @pytest.fixture
    def mock_uploaded_file(self):
        """Create a mock uploaded file."""
        return MockUploadedFile(
            name="test_image.jpg",
            content=b"fake image content",
            content_type="image/jpeg",
        )

    def test_init_creates_s3_client_for_aws(self):
        """Test that MediasStore creates S3 client for AWS when URI starts with s3://."""
        with patch("core.medias_store.client") as mock_client_factory:
            mock_client = MagicMock()
            mock_client_factory.return_value = mock_client

            with patch("core.medias_store.config") as mock_config:
                mock_config.MEDIA_STORAGE_URI = "s3://my-bucket"
                mock_config.S3_REGION = "us-east-1"
                mock_config.S3_ACCESS_KEY_ID = "test_key"
                mock_config.S3_SECRET_ACCESS_KEY = "test_secret"

                store = MediasStore()

                mock_client_factory.assert_called_once_with(
                    "s3",
                    endpoint_url="https://s3.us-east-1.amazonaws.com",
                    region_name="us-east-1",
                    aws_access_key_id="test_key",
                    aws_secret_access_key="test_secret",
                )
                assert store._backend == "s3"
                assert store._bucket_name == "my-bucket"
                assert store.s3_client == mock_client

    def test_init_creates_s3_client_for_minio(self):
        """Test that MediasStore creates S3 client for MinIO when URI is a local path."""
        with patch("core.medias_store.client") as mock_client_factory:
            mock_client = MagicMock()
            mock_client_factory.return_value = mock_client

            with patch("core.medias_store.config") as mock_config:
                mock_config.MEDIA_STORAGE_URI = "/some/local/media_files"
                mock_config.MINIO_ENDPOINT = "http://localhost:9000"
                mock_config.MINIO_ROOT_USER = "minioadmin"
                mock_config.MINIO_ROOT_PASSWORD = "minioadmin"

                store = MediasStore()

                mock_client_factory.assert_called_once_with(
                    "s3",
                    endpoint_url="http://localhost:9000",
                    region_name="us-east-1",
                    aws_access_key_id="minioadmin",
                    aws_secret_access_key="minioadmin",
                )
                assert store._backend == "minio"
                assert store._bucket_name == "media-files"
                assert store.s3_client == mock_client

    def test_upload_media_creates_metadata(self, media_store, mock_uploaded_file):
        """Test that upload_media creates correct metadata."""
        conversation_id = "test_conv_123"
        issuer_id = "user_456"

        metadata = media_store.upload_media(
            uploaded_file=mock_uploaded_file,
            conversation_id=conversation_id,
            issuer_id=issuer_id,
        )

        assert isinstance(metadata, MediaMetadata)
        assert metadata.size == len(b"fake image content")
        assert metadata.type == "image"
        assert metadata.issuer_id == issuer_id
        assert metadata.uri.startswith(f"s3://test-bucket/{conversation_id}/")
        assert metadata.key.startswith(f"{conversation_id}/")
        assert metadata.key.endswith(".jpg")
        assert metadata.timestamp is not None

    def test_upload_media_uploads_to_s3(self, media_store, mock_uploaded_file):
        """Test that upload_media uploads file to S3."""
        conversation_id = "test_conv_123"
        issuer_id = "user_456"

        media_store.upload_media(
            uploaded_file=mock_uploaded_file,
            conversation_id=conversation_id,
            issuer_id=issuer_id,
        )

        # Verify S3 upload was called
        media_store.s3_client.upload_fileobj.assert_called_once()
        call_args = media_store.s3_client.upload_fileobj.call_args
        assert call_args[1]["Fileobj"] == mock_uploaded_file
        assert call_args[1]["Bucket"] == "test-bucket"
        assert call_args[1]["Key"].startswith(f"{conversation_id}/")

    def test_upload_media_handles_s3_error(self, media_store, mock_uploaded_file):
        """Test that upload_media handles S3 upload errors properly."""
        conversation_id = "test_conv_123"
        issuer_id = "user_456"

        # Mock S3 client to raise an OSError
        media_store.s3_client.upload_fileobj.side_effect = OSError("S3 upload failed")

        with pytest.raises(OSError, match="Failed to store media file"):
            media_store.upload_media(
                uploaded_file=mock_uploaded_file,
                conversation_id=conversation_id,
                issuer_id=issuer_id,
            )

    def test_determine_media_type_by_content_type(self, media_store):
        """Test media type determination by content type."""
        # Test image
        image_file = MockUploadedFile("test.jpg", b"content", "image/jpeg")
        assert media_store._determine_media_type(image_file) == "image"

        # Test video
        video_file = MockUploadedFile("test.mp4", b"content", "video/mp4")
        assert media_store._determine_media_type(video_file) == "video"

        # Test audio
        audio_file = MockUploadedFile("test.mp3", b"content", "audio/mpeg")
        assert media_store._determine_media_type(audio_file) == "audio"

    def test_determine_media_type_by_extension(self, media_store):
        """Test media type determination by file extension."""
        # Test image extensions
        for ext in [".jpg", ".png", ".gif", ".bmp", ".webp"]:
            file = MockUploadedFile(f"test{ext}", b"content")
            assert media_store._determine_media_type(file) == "image"

        # Test video extensions
        for ext in [".mp4", ".avi", ".mov", ".wmv", ".flv"]:
            file = MockUploadedFile(f"test{ext}", b"content")
            assert media_store._determine_media_type(file) == "video"

        # Test audio extensions
        for ext in [".mp3", ".wav", ".flac", ".aac", ".ogg"]:
            file = MockUploadedFile(f"test{ext}", b"content")
            assert media_store._determine_media_type(file) == "audio"

    def test_determine_media_type_unsupported_raises_error(self, media_store):
        """Test that unsupported media types raise ValueError."""
        unsupported_file = MockUploadedFile("test.txt", b"content", "text/plain")
        with pytest.raises(ValueError, match="Unsupported media type"):
            media_store._determine_media_type(unsupported_file)

    def test_generate_presigned_url_success(self, media_store):
        """Test get_generate_presigned_url returns URL successfully."""
        metadata = MediaMetadata(
            id="test_id",
            uri="s3://test-bucket/conv123/file.jpg",
            key="conv123/file.jpg",
            size=1000,
            type="image",
            issuer_id="user123",
            timestamp=datetime.now(),  # noqa: DTZ005
        )

        url = media_store.generate_presigned_url(metadata, expiration=3600)

        assert url == "https://example.com/presigned-url"
        media_store.s3_client.generate_presigned_url.assert_called_once_with(
            "get_object",
            Params={"Bucket": "test-bucket", "Key": "conv123/file.jpg"},
            ExpiresIn=3600,
        )

    def test_generate_presigned_url_client_error(self, media_store):
        """Test generate_presigned_url handles ClientError."""
        metadata = MediaMetadata(
            id="test_id",
            uri="s3://test-bucket/conv123/file.jpg",
            key="conv123/file.jpg",
            size=1000,
            type="image",
            issuer_id="user123",
            timestamp=datetime.now(),  # noqa: DTZ005
        )

        # Mock S3 client to raise ClientError
        media_store.s3_client.generate_presigned_url.side_effect = ClientError(
            error_response={"Error": {"Code": "NoSuchKey", "Message": "Key not found"}},
            operation_name="GetObject",
        )

        url = media_store.generate_presigned_url(metadata)

        assert url is None

    def test_get_file_extension(self, media_store):
        """Test _get_file_extension method."""
        assert media_store._get_file_extension("test.jpg") == ".jpg"
        assert media_store._get_file_extension("file.name.png") == ".png"
        assert media_store._get_file_extension("noextension") == ""
        assert media_store._get_file_extension("") == ""
