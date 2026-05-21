from __future__ import annotations

import base64
import io

import pytest
from fastapi import HTTPException
from PIL import Image

from modal_app import resolve_query_image, MAX_IMAGE_BYTES


def _b64_png(size: tuple[int, int] = (16, 16)) -> str:
    img = Image.new("RGB", size, (10, 20, 30))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_resolve_query_image_accepts_image_url(monkeypatch):
    sentinel = Image.new("RGB", (4, 4))
    called = {}

    def fake_loader(url, timeout=10):
        called["url"] = url
        return sentinel

    img = resolve_query_image({"image_url": "https://x/y.jpg"}, url_loader=fake_loader)
    assert img is sentinel
    assert called["url"] == "https://x/y.jpg"


def test_resolve_query_image_accepts_image_bytes():
    img = resolve_query_image({"image_bytes": _b64_png()})
    assert img.size == (16, 16)
    assert img.mode == "RGB"


def test_resolve_query_image_rejects_when_neither_provided():
    with pytest.raises(HTTPException) as exc:
        resolve_query_image({})
    assert exc.value.status_code == 400


def test_resolve_query_image_rejects_when_both_provided():
    with pytest.raises(HTTPException) as exc:
        resolve_query_image({"image_url": "https://x", "image_bytes": _b64_png()})
    assert exc.value.status_code == 400


def test_resolve_query_image_rejects_oversized_bytes():
    huge = base64.b64encode(b"\x00" * (MAX_IMAGE_BYTES + 1)).decode("ascii")
    with pytest.raises(HTTPException) as exc:
        resolve_query_image({"image_bytes": huge})
    assert exc.value.status_code == 400


def test_resolve_query_image_rejects_undecodable_bytes():
    bad = base64.b64encode(b"not an image").decode("ascii")
    with pytest.raises(HTTPException) as exc:
        resolve_query_image({"image_bytes": bad})
    assert exc.value.status_code == 400


def test_resolve_query_image_propagates_url_loader_failure():
    def fake_loader(url, timeout=10):
        raise RuntimeError("boom")

    with pytest.raises(HTTPException) as exc:
        resolve_query_image({"image_url": "https://x"}, url_loader=fake_loader)
    assert exc.value.status_code == 400
    assert "boom" in exc.value.detail
