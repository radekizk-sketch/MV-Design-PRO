from __future__ import annotations

import logging
from pathlib import Path

import pytest
from application.symphony.image_payload import (
    ImageAttachmentError,
    build_image_data_url,
    filter_valid_image_content,
    validate_image_data_url,
)


def test_validate_image_data_url_accepts_png_and_jpeg() -> None:
    assert validate_image_data_url("data:image/png;base64,aW1hZ2U=") == (
        "data:image/png;base64,aW1hZ2U="
    )
    assert validate_image_data_url("data:image/jpeg;base64,aW1hZ2U=") == (
        "data:image/jpeg;base64,aW1hZ2U="
    )


def test_build_image_data_url_rejects_zero_byte_file(tmp_path: Path) -> None:
    empty_png = tmp_path / "empty.png"
    empty_png.write_bytes(b"")

    with pytest.raises(ImageAttachmentError, match="Empty image attachment"):
        build_image_data_url(
            empty_png,
            location="input[356].content[2].image_url",
        )


def test_build_image_data_url_rejects_missing_file(tmp_path: Path) -> None:
    missing_png = tmp_path / "missing.png"

    with pytest.raises(ImageAttachmentError, match="Missing image attachment"):
        build_image_data_url(missing_png)


def test_validate_image_data_url_rejects_empty_base64_with_location() -> None:
    with pytest.raises(ImageAttachmentError) as exc_info:
        validate_image_data_url(
            "data:image/png;base64,",
            location="input[356].content[2].image_url",
        )

    message = str(exc_info.value)
    assert "Empty image attachment" in message
    assert "input[356].content[2].image_url" in message


def test_validate_image_data_url_rejects_unsupported_mime() -> None:
    with pytest.raises(ImageAttachmentError, match="Unsupported image MIME type"):
        validate_image_data_url("data:image/gif;base64,aW1hZ2U=")


def test_build_image_data_url_accepts_png_and_jpeg_files(tmp_path: Path) -> None:
    png = tmp_path / "image.png"
    jpg = tmp_path / "image.jpg"
    png.write_bytes(b"\x89PNG\r\n\x1a\npayload")
    jpg.write_bytes(b"\xff\xd8\xffpayload")

    png_url = build_image_data_url(png)
    jpg_url = build_image_data_url(jpg)

    assert png_url is not None
    assert png_url.startswith("data:image/png;base64,")
    assert not png_url.endswith("base64,")
    assert jpg_url is not None
    assert jpg_url.startswith("data:image/jpeg;base64,")
    assert not jpg_url.endswith("base64,")


def test_filter_valid_image_content_skips_invalid_optional_image(
    caplog: pytest.LogCaptureFixture,
) -> None:
    content = [
        {"type": "input_text", "text": "zostaje"},
        {"type": "input_image", "image_url": "data:image/png;base64,"},
        {"type": "input_image", "image_url": "data:image/png;base64,aW1hZ2U="},
    ]

    with caplog.at_level(logging.WARNING):
        filtered = filter_valid_image_content(
            content,
            location="input[356].content",
            required_images=False,
        )

    assert filtered == [
        {"type": "input_text", "text": "zostaje"},
        {"type": "input_image", "image_url": "data:image/png;base64,aW1hZ2U="},
    ]
    assert "input[356].content[1].image_url" in caplog.text


def test_filter_valid_image_content_raises_for_required_image() -> None:
    with pytest.raises(ImageAttachmentError, match=r"input\[356\]\.content\[2\]\.image_url"):
        filter_valid_image_content(
            [
                {"type": "input_text", "text": "ok"},
                {"type": "input_text", "text": "ok"},
                {"type": "input_image", "image_url": "data:image/jpeg;base64,"},
            ],
            location="input[356].content",
            required_images=True,
        )
