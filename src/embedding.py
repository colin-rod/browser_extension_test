from __future__ import annotations

import io
from typing import Iterable

import requests
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

MODEL_ID = "patrickjohncyh/fashion-clip"


def load_model() -> tuple[CLIPModel, CLIPProcessor]:
    """Load FashionCLIP. First call downloads ~600MB."""
    model = CLIPModel.from_pretrained(MODEL_ID)
    processor = CLIPProcessor.from_pretrained(MODEL_ID)
    model.eval()
    return model, processor


def load_image_from_url(url: str, timeout: float = 10.0) -> Image.Image:
    resp = requests.get(
        url,
        timeout=timeout,
        headers={"User-Agent": "Mozilla/5.0 (sellpy-visual-search MVP)"},
    )
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGB")


def embed_images(
    model: CLIPModel,
    processor: CLIPProcessor,
    images: Iterable[Image.Image],
) -> torch.Tensor:
    """Return L2-normalized image embeddings. Shape: (N, 512)."""
    inputs = processor(images=list(images), return_tensors="pt")
    with torch.no_grad():
        features = model.get_image_features(**inputs)
    if hasattr(features, "image_embeds"):
        features = features.image_embeds
    elif hasattr(features, "pooler_output"):
        features = features.pooler_output
    return features / features.norm(dim=-1, keepdim=True)
