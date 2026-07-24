from __future__ import annotations

import base64
import binascii
import logging
import mimetypes
import re
from collections.abc import Mapping, Sequence
from pathlib import Path

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
_DATA_IMAGE_URL_RE = re.compile(r"^data:(image/[A-Za-z0-9.+-]+);base64,(.*)$", re.DOTALL)
_EMPTY_DATA_IMAGE_IN_TEXT_RE = re.compile(r"data:image/[A-Za-z0-9.+-]+;base64,(?=$|[\s)'\"\]>}])")


class ImageAttachmentError(ValueError):
    """Local error raised before an invalid image attachment reaches an API request."""

    def __init__(
        self,
        message: str,
        *,
        location: str | None = None,
        path: str | None = None,
    ) -> None:
        details: list[str] = []
        if location:
            details.append(f"location: {location}")
        if path:
            details.append(f"path: {path}")
        suffix = f" ({'; '.join(details)})" if details else ""
        super().__init__(f"{message}{suffix}")
        self.location = location
        self.path = path


def validate_image_data_url(
    data_url: str,
    *,
    location: str = "image_url",
    path: str | None = None,
) -> str:
    """Validate an OpenAI-compatible image data URL and return it unchanged."""

    match = _DATA_IMAGE_URL_RE.match(data_url)
    if not match:
        raise ImageAttachmentError(
            "Invalid image data URL. Expected data:image/<type>;base64,<bytes>.",
            location=location,
            path=path,
        )

    mime_type, encoded = match.groups()
    if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
        allowed = ", ".join(sorted(ALLOWED_IMAGE_MIME_TYPES))
        raise ImageAttachmentError(
            f"Unsupported image MIME type: {mime_type}. Allowed: {allowed}.",
            location=location,
            path=path,
        )

    if not encoded.strip():
        raise ImageAttachmentError(
            "Empty image attachment: inline data URL. Reattach or regenerate the screenshot.",
            location=location,
            path=path,
        )

    try:
        decoded = base64.b64decode(encoded, validate=True)
    except binascii.Error as exc:
        raise ImageAttachmentError(
            "Invalid image Base64 payload.",
            location=location,
            path=path,
        ) from exc

    if not decoded:
        raise ImageAttachmentError(
            "Empty image attachment: decoded image has 0 bytes.",
            location=location,
            path=path,
        )
    return data_url


def build_image_data_url(
    image_path: str | Path,
    *,
    location: str = "image_url",
    required: bool = True,
    log: logging.Logger | None = None,
) -> str | None:
    """Build and validate a data URL from a local image file."""

    path = Path(image_path)
    diagnostic_logger = log or logger

    try:
        resolved_path = str(path.resolve())
    except OSError:
        resolved_path = str(path)

    def reject(message: str) -> None:
        error = ImageAttachmentError(message, location=location, path=resolved_path)
        if required:
            raise error
        diagnostic_logger.warning("%s", error)

    if not path.exists():
        reject(f"Missing image attachment: {resolved_path}. Reattach or regenerate the screenshot.")
        return None
    if not path.is_file():
        reject(f"Image attachment is not a file: {resolved_path}.")
        return None

    try:
        size_bytes = path.stat().st_size
    except OSError as exc:
        reject(f"Cannot read image attachment metadata: {resolved_path}. {exc}")
        return None
    if size_bytes <= 0:
        reject(f"Empty image attachment: {resolved_path}. Reattach or regenerate the screenshot.")
        return None

    mime_type = mimetypes.guess_type(str(path))[0]
    if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
        allowed = ", ".join(sorted(ALLOWED_IMAGE_MIME_TYPES))
        reject(f"Unsupported image MIME type: {mime_type or 'unknown'}. Allowed: {allowed}.")
        return None

    try:
        image_bytes = path.read_bytes()
    except OSError as exc:
        reject(f"Cannot read image attachment: {resolved_path}. {exc}")
        return None

    if not image_bytes:
        reject(f"Empty image attachment: {resolved_path}. Reattach or regenerate the screenshot.")
        return None

    encoded = base64.b64encode(image_bytes).decode("ascii")
    if not encoded:
        reject(f"Empty image attachment: {resolved_path}. Base64 encoding produced no bytes.")
        return None

    return validate_image_data_url(
        f"data:{mime_type};base64,{encoded}",
        location=location,
        path=resolved_path,
    )


def filter_valid_image_content(
    content: Sequence[Mapping[str, object]],
    *,
    location: str = "input.content",
    required_images: bool = False,
    log: logging.Logger | None = None,
) -> list[dict[str, object]]:
    """Return content items with invalid optional image entries removed."""

    diagnostic_logger = log or logger
    filtered: list[dict[str, object]] = []
    for index, item in enumerate(content):
        item_location = f"{location}[{index}]"
        copied = dict(item)
        image_url = copied.get("image_url")
        if image_url is None:
            filtered.append(copied)
            continue

        try:
            if isinstance(image_url, str):
                copied["image_url"] = validate_image_data_url(
                    image_url,
                    location=f"{item_location}.image_url",
                )
            elif isinstance(image_url, Mapping):
                nested = dict(image_url)
                url = nested.get("url")
                if not isinstance(url, str):
                    raise ImageAttachmentError(
                        "Invalid image_url object. Expected string field 'url'.",
                        location=f"{item_location}.image_url.url",
                    )
                nested["url"] = validate_image_data_url(
                    url,
                    location=f"{item_location}.image_url.url",
                )
                copied["image_url"] = nested
            else:
                raise ImageAttachmentError(
                    "Invalid image_url value. Expected string data URL or object with url.",
                    location=f"{item_location}.image_url",
                )
        except ImageAttachmentError as exc:
            if required_images:
                raise
            diagnostic_logger.warning("%s", exc)
            continue

        filtered.append(copied)
    return filtered


def assert_no_empty_image_data_urls(text: str, *, location: str) -> str:
    """Reject empty inline image data URLs in prompt text before agent dispatch."""

    match = _EMPTY_DATA_IMAGE_IN_TEXT_RE.search(text)
    if match:
        raise ImageAttachmentError(
            "Empty image attachment: inline data URL. Reattach or regenerate the screenshot.",
            location=location,
        )
    return text
