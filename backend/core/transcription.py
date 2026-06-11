"""Speech-to-text transcription via Mistral Voxtral.

Voice messages are transcribed on the fly when they are sent, before the
response is returned to the client (spreads API calls across the night).
Failures are non-fatal: the message is stored without a transcription.
"""

from typing import Any

import requests
from loguru import logger

from core import config

MISTRAL_TRANSCRIPTION_URL = "https://api.mistral.ai/v1/audio/transcriptions"
TRANSCRIPTION_TIMEOUT_SECONDS = 60


def transcribe_audio(uploaded_file: Any) -> str | None:
    """Transcribe an uploaded audio file using Mistral Voxtral.

    Args:
        uploaded_file: The uploaded audio file from Django (file-like object).

    Returns:
        The transcription text, or None if transcription is unavailable or failed.

    """
    if not config.MISTRAL_API_KEY:
        logger.warning("MISTRAL_API_KEY not configured, skipping audio transcription")
        return None

    try:
        file_obj = uploaded_file.file if hasattr(uploaded_file, "file") else uploaded_file
        file_obj.seek(0)
        filename = getattr(uploaded_file, "name", None) or "audio.webm"
        content_type = getattr(uploaded_file, "content_type", None) or "audio/webm"

        response = requests.post(
            MISTRAL_TRANSCRIPTION_URL,
            headers={"x-api-key": config.MISTRAL_API_KEY},
            files={"file": (filename, file_obj, content_type)},
            data={"model": config.MISTRAL_TRANSCRIPTION_MODEL},
            timeout=TRANSCRIPTION_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        transcription = response.json().get("text")
        logger.info(f"Transcribed audio file '{filename}' ({len(transcription or '')} chars)")
        return transcription
    except Exception as e:
        logger.error(f"Audio transcription failed: {e}")
        return None
    finally:
        try:
            file_obj.seek(0)
        except Exception:
            pass
