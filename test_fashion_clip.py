"""
FashionCLIP similarity sanity check.

Goal: confirm that FashionCLIP produces sensible similarity scores between
an arbitrary query image and a small catalog of Sellpy items.

Usage:
    pip install torch transformers pillow requests
    python test_fashion_clip.py

Edit CATALOG and QUERY_IMAGE below with real Sellpy URLs.
"""

import io
import sys
from typing import List, Tuple

import requests
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

MODEL_ID = "patrickjohncyh/fashion-clip"

# Replace these with real Sellpy item objectids + image URLs.
# Pick 10-20 visually distinctive items: dress, sneakers, denim jacket, etc.
CATALOG: List[Tuple[str, str, str]] = [
    # (objectid, category, image_url) - items with null URLs filtered out
    ("YzLrgoB3tr", "T-shirts & Tank tops",  "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-standard-4-k-4/YzLrgoB3tr-d3f0-0.jpg"),
    ("9rBHqLMI2P", "T-shirts & Tank tops",  "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-standard-4-k-12/9rBHqLMI2P-8fac-0.jpg"),
    ("b0I0cZ3GNS", "Shirts & Blouses",      "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-standard-7-k-8/b0I0cZ3GNS-40ae-0.jpg"),
    ("A4d91xj0og", "Jackets & Outerwear",   "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-standard-6-k-14/ainrRpdUS6-4f1d-0.jpg"),
    ("C5LlzmPBoC", "T-shirts & Tank tops",  "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-standard-4-k-12/C5LlzmPBoC-038f-0.jpg"),
    ("jeXoAiDWPX", "Belts",                 "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-manual-12-k-14/jeXoAiDWPX-4eae-single.jpg"),
    ("9dhUpWXfoQ", "T-shirts & Tank tops",  "https://prod.images.sellpy.net/fit-in/320x320/phone-images/9dhUpWXfoQ-288c.jpg"),
    ("kytlRF285s", "Dresses",               "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-standard-5-k-9/kytlRF285s-e1f4-0.jpg"),
    ("jy5AqIRdQY", "Pants & Jeans",         "https://prod.images.sellpy.net/fit-in/320x320/phone-images/jy5AqIRdQY-f268.jpg"),
    ("1BMoMJmDIv", "Jackets & Outerwear",   "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-standard-1-k-21/1BMoMJmDIv-5b42-0.jpg"),
    ("CdAn2AtEZ7", "Sweaters & Cardigans",  "https://prod.images.sellpy.net/fit-in/320x320/phone-images/CdAn2AtEZ7-7e8e.jpg"),
    ("JTXPREr8nH", "Shirts & Blouses",      "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-standard-2-k-6/JTXPREr8nH-cb6e-0.jpg"),
    ("ThltBCxrx5", "Dresses",               "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-standard-7-k-3/ThltBCxrx5-495d-0.jpg"),
    ("X5vemiDqCa", "Jackets & Outerwear",   "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-standard-3-k-10/X5vemiDqCa-4c62-0.jpg"),
    ("vzOCWXcUjX", "Dresses",               "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-standard-5-k-2/vzOCWXcUjX-c553-0.jpg"),
    ("bW3yeJvLbw", "Dresses",               "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-standard-1-k-13/URwGcUtA52-a63f-0.jpg"),
    ("yCbAHVp2wl", "Headwear",              "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-fixed-13-l-1/oRc8SLfclM-ab66-0-timed-sequence.jpg"),
    ("KqOuKjzC5f", "Dresses",               "https://prod.images.sellpy.net/fit-in/320x320/photoRobot-standard-15-k-4/KqOuKjzC5f-b9ca-0.jpg"),
]

# Sanity test: query with one of the catalog images.
# Expect: itself at the top with ~1.0, then visually/semantically similar items.
# Using a dress — expect other dresses to rank highly.
QUERY_OBJECTID = "H&M"
QUERY_IMAGE = "https://image.hm.com/assets/hm/0f/72/0f727c46982cb25224f35d54ef0ed3bfe02b6271.jpg?imwidth=2160"


def load_image(src: str) -> Image.Image:
    """Load an image from URL or local path."""
    if src.startswith("http"):
        resp = requests.get(src, timeout=30)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content)).convert("RGB")
    return Image.open(src).convert("RGB")


def embed_images(model, processor, images: List[Image.Image]) -> torch.Tensor:
    """Run images through FashionCLIP, return L2-normalized embeddings."""
    inputs = processor(images=images, return_tensors="pt")
    with torch.no_grad():
        features = model.get_image_features(**inputs)
    # transformers v5 wraps the output; older versions return a tensor directly
    if hasattr(features, "image_embeds"):
        features = features.image_embeds
    elif hasattr(features, "pooler_output"):
        features = features.pooler_output
    # Normalize so dot product == cosine similarity
    features = features / features.norm(dim=-1, keepdim=True)
    return features


def main():
    print(f"Loading {MODEL_ID} (first run downloads ~600MB)...")
    model = CLIPModel.from_pretrained(MODEL_ID)
    processor = CLIPProcessor.from_pretrained(MODEL_ID)
    model.eval()

    print(f"Loading {len(CATALOG)} catalog images...")
    catalog_images = []
    catalog_meta = []  # (objectid, category)
    for objectid, category, url in CATALOG:
        try:
            img = load_image(url)
            catalog_images.append(img)
            catalog_meta.append((objectid, category))
        except Exception as e:
            print(f"  ! skipped {objectid}: {e}", file=sys.stderr)

    if not catalog_images:
        print("No catalog images loaded. Check URLs.", file=sys.stderr)
        sys.exit(1)

    print("Embedding catalog...")
    catalog_emb = embed_images(model, processor, catalog_images)

    print(f"Loading query image: {QUERY_IMAGE}")
    query_img = load_image(QUERY_IMAGE)
    print("Embedding query...")
    query_emb = embed_images(model, processor, [query_img])

    # Cosine similarity (both already normalized): just dot product
    similarities = (query_emb @ catalog_emb.T).squeeze(0)  # shape: (N,)

    # Rank
    ranked = sorted(
        zip(catalog_meta, similarities.tolist()),
        key=lambda x: x[1],
        reverse=True,
    )

    print(f"\n--- Top matches (query: {QUERY_OBJECTID}) ---")
    for rank, ((objectid, category), score) in enumerate(ranked, 1):
        marker = " <-- query itself" if objectid == QUERY_OBJECTID else ""
        print(f"{rank:>2}. {objectid:<12} {category:<24} sim={score:.4f}{marker}")

    print(f"\nEmbedding dimension: {catalog_emb.shape[1]}")


if __name__ == "__main__":
    main()