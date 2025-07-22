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
    Files are stored in a S3 bucket.
    """

    def __init__(self) -> None:
        """
        Initialize MediaStore with a base storage path.

        Args:
            base_path: Base directory for media storage. Defaults to config.MEDIA_STORAGE_PATH
        """
        self.s3_client = client(
            "s3",
            endpoint_url=config.S3_ENDPOINT_URL,
            region_name=config.S3_REGION,
            aws_access_key_id=config.S3_ACCESS_KEY_ID,
            aws_secret_access_key=config.S3_SECRET_ACCESS_KEY,
        )

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
            # ninja.UploadedFile has a .file attribute that contains the actual file-like object
            file_obj = uploaded_file.file if hasattr(uploaded_file, "file") else uploaded_file
            self.s3_client.upload_fileobj(
                Fileobj=file_obj,
                Bucket=config.S3_BUCKET_NAME,
                Key=object_key,
            )
        except OSError as e:
            raise OSError(f"Failed to store media file: {e}") from e

        return MediaMetadata(
            id=media_id,
            uri=f"s3://{config.S3_BUCKET_NAME}/{object_key}",
            key=object_key,
            size=uploaded_file.size,
            type=media_type,
            issuer_id=issuer_id,
            timestamp=pytz.timezone("Europe/Paris").localize(datetime.now()),  # noqa: DTZ005
        )

    def generate_presigned_url(self, media_metadata: MediaMetadata, expiration: int = 1800) -> str:
        try:
            response = self.s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": config.S3_BUCKET_NAME, "Key": media_metadata.key},
                ExpiresIn=expiration,
            )
        except ClientError as e:
            logger.error(e)
            return None

        return response

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

        image_extensions = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"}
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
