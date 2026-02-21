import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import pytz
from boto3 import client
from botocore.exceptions import ClientError
from loguru import logger

from core import config
from core.models import MediaMetadata


class MediasStore:
    """
    MediaStore handles the storage and retrieval of media files (images, videos, audio).

    Configured via a single MEDIA_STORAGE_URI:
      - "s3://bucket-name"  -> AWS S3 backend (uses S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION)
      - "/some/local/path"  -> Local MinIO backend (uses MINIO_ENDPOINT, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD)

    Both backends use the same boto3 S3 API (MinIO is S3-compatible).
    """

    def __init__(self) -> None:
        """
        Initialize MediaStore by parsing MEDIA_STORAGE_URI to determine the backend.
        """
        uri = config.MEDIA_STORAGE_URI

        if uri.startswith("s3://"):
            self._backend = "s3"
            self._bucket_name = uri[len("s3://") :]
            self._endpoint_url = f"https://s3.{config.S3_REGION}.amazonaws.com"
            self.s3_client = client(
                "s3",
                endpoint_url=self._endpoint_url,
                region_name=config.S3_REGION,
                aws_access_key_id=config.S3_ACCESS_KEY_ID,
                aws_secret_access_key=config.S3_SECRET_ACCESS_KEY,
            )
        else:
            self._backend = "minio"
            # For local paths, derive a DNS-compliant bucket name from the last path component
            # (lowercase, slashes/underscores replaced with hyphens, leading/trailing hyphens stripped)
            last_component = uri.strip("/").split("/")[-1] if "/" in uri.strip("/") else uri.strip("/")
            self._bucket_name = last_component.replace("_", "-").lower() or "media-files"
            self._endpoint_url = config.MINIO_ENDPOINT
            self.s3_client = client(
                "s3",
                endpoint_url=self._endpoint_url,
                region_name="us-east-1",
                aws_access_key_id=config.MINIO_ROOT_USER,
                aws_secret_access_key=config.MINIO_ROOT_PASSWORD,
            )

        # Ensure bucket exists
        self._ensure_bucket()
        logger.info(
            f"MediasStore initialized: backend={self._backend}, "
            f"bucket={self._bucket_name}, endpoint={self._endpoint_url}",
        )

    def _ensure_bucket(self) -> None:
        """Check if the bucket exists; create it if using MinIO."""
        try:
            self.s3_client.head_bucket(Bucket=self._bucket_name)
        except ClientError as e:
            error_code = int(e.response["Error"]["Code"])
            # MinIO returns 400 or 404 for non-existent buckets depending on version
            if error_code in (400, 404) and self._backend == "minio":
                logger.info(f"Bucket '{self._bucket_name}' not found on MinIO, creating it...")
                self.s3_client.create_bucket(Bucket=self._bucket_name)
                logger.info(f"Bucket '{self._bucket_name}' created successfully.")
            else:
                logger.error(
                    f"Storage initialization failed: {e} "
                    f"(backend={self._backend}, bucket={self._bucket_name}, endpoint={self._endpoint_url})",
                )
                raise
        except Exception as e:
            logger.error(
                f"Storage initialization failed: {e} "
                f"(backend={self._backend}, bucket={self._bucket_name}, endpoint={self._endpoint_url})",
            )
            raise

    def upload_media(self, uploaded_file: Any, conversation_id: str, issuer_id: str) -> MediaMetadata:
        """
        Store an uploaded media file and return its metadata.

        Args:
            uploaded_file: The uploaded file from Django
            conversation_id: ID of the conversation this media belongs to
            issuer_id: ID of the user who uploaded the media

        Returns:
            MediaMetadata object with file information

        """
        media_id = str(uuid.uuid4())
        media_type = self._determine_media_type(uploaded_file)
        file_extension = self._get_file_extension(uploaded_file.name)
        object_key = f"{conversation_id}/{media_id}{file_extension}"

        try:
            file_obj = uploaded_file.file if hasattr(uploaded_file, "file") else uploaded_file
            self.s3_client.upload_fileobj(
                Fileobj=file_obj,
                Bucket=self._bucket_name,
                Key=object_key,
            )
            uri = f"s3://{self._bucket_name}/{object_key}"
        except Exception as e:
            logger.error(f"Upload failed ({self._backend}): {e}")
            raise OSError(f"Failed to store media file: {e}") from e

        return MediaMetadata(
            id=media_id,
            uri=uri,
            key=object_key,
            size=uploaded_file.size,
            type=media_type,
            issuer_id=issuer_id,
            timestamp=datetime.now(tz=pytz.timezone("Europe/Paris")),
        )

    def generate_presigned_url(self, media_metadata: MediaMetadata, expiration: int = 1800) -> str:
        if self._backend == "minio":
            # For MinIO, return a backend-proxied URL instead of a direct MinIO presigned URL.
            # Direct MinIO URLs point to localhost which is unreachable from external devices.
            return f"/media/{media_metadata.id}"
        try:
            return self.s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket_name, "Key": media_metadata.key},
                ExpiresIn=expiration,
            )
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return None

    def download_media(self, media_metadata: MediaMetadata) -> bytes | None:
        """Download media file content from storage backend."""
        try:
            response = self.s3_client.get_object(Bucket=self._bucket_name, Key=media_metadata.key)
            return response["Body"].read()
        except ClientError as e:
            logger.error(f"Failed to download media {media_metadata.key}: {e}")
            return None

    def media_exists(self, media_metadata: MediaMetadata) -> bool:
        """Check if a media object exists in the bucket."""
        try:
            self.s3_client.head_object(Bucket=self._bucket_name, Key=media_metadata.key)
            return True
        except ClientError:
            return False

    def delete_media(self, media_metadata: MediaMetadata) -> bool:
        """Delete a media object from the bucket."""
        try:
            self.s3_client.delete_object(Bucket=self._bucket_name, Key=media_metadata.key)
            return True
        except ClientError as e:
            logger.error(f"Failed to delete media {media_metadata.key}: {e}")
            return False

    def _determine_media_type(self, uploaded_file: Any) -> str:
        content_type = uploaded_file.content_type or ""
        filename = uploaded_file.name or ""

        # Check content type first
        if content_type.startswith("image/"):
            return "image"
        if content_type.startswith("video/"):
            return "video"
        if content_type.startswith("audio/"):
            return "audio"

        # Fallback to file extension
        extension = self._get_file_extension(filename).lower()

        image_extensions = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".heic", ".heif"}
        video_extensions = {".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm", ".mkv"}
        audio_extensions = {".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma"}

        if extension in image_extensions:
            return "image"
        if extension in video_extensions:
            return "video"
        if extension in audio_extensions:
            return "audio"

        raise ValueError(f"Unsupported media type: {content_type} / {extension}")

    def _get_file_extension(self, filename: str) -> str:
        if not filename:
            return ""
        return Path(filename).suffix
