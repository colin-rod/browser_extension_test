from __future__ import annotations

import io

import pytest
from PIL import Image

from src.embedding import load_image_from_bytes


def _png_bytes(color: tuple[int, int, int] = (255, 0, 0)) -> bytes:
    img = Image.new("RGB", (32, 32), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_bytes(color: tuple[int, int, int] = (0, 128, 0)) -> bytes:
    img = Image.new("RGB", (32, 32), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_load_image_from_bytes_decodes_png():
    img = load_image_from_bytes(_png_bytes())
    assert isinstance(img, Image.Image)
    assert img.mode == "RGB"
    assert img.size == (32, 32)


def test_load_image_from_bytes_decodes_jpeg():
    img = load_image_from_bytes(_jpeg_bytes())
    assert isinstance(img, Image.Image)
    assert img.mode == "RGB"
    assert img.size == (32, 32)


def test_load_image_from_bytes_rejects_non_image():
    with pytest.raises(ValueError):
        load_image_from_bytes(b"not an image at all")
