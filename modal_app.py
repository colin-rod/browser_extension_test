from __future__ import annotations

import modal

APP_NAME = "sellpy-visual-search"
VOLUME_NAME = "sellpy-visual-search-catalog"
CATALOG_DIR = "/catalog"  # mount point inside the container

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.2.2",
        "transformers==4.40.2",
        "pillow==10.3.0",
        "requests==2.32.3",
        "numpy==1.26.4",
        "google-cloud-bigquery==3.25.0",
        "db-dtypes==1.2.0",
        "pyarrow==16.1.0",
        "fastapi==0.111.0",
    )
    .add_local_python_source("src")
)

app = modal.App(APP_NAME, image=image)
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)


@app.function(
    gpu="T4",
    timeout=60 * 60,
    volumes={CATALOG_DIR: volume},
    secrets=[modal.Secret.from_name("gcp-bigquery")],
)
def embed_catalog(limit: int = 10_000) -> dict:
    """One-shot: query BigQuery, embed N items, write to Volume."""
    import json
    import sys
    import time
    from concurrent.futures import ThreadPoolExecutor

    import numpy as np
    import torch

    from src.catalog_query import fetch_catalog
    from src.embedding import load_image_from_url, load_model

    t0 = time.monotonic()
    print(f"Fetching up to {limit} items from BigQuery...")
    items = fetch_catalog(limit=limit)
    print(f"  got {len(items)} items in {time.monotonic() - t0:.1f}s")

    print("Loading FashionCLIP...")
    model, processor = load_model()
    model = model.to("cuda")

    print(f"Downloading {len(items)} images in parallel...")

    def _download(i):
        try:
            return i, load_image_from_url(items[i].image_url, timeout=20)
        except Exception as e:
            print(f"  ! skip {items[i].objectid}: {e}", file=sys.stderr)
            return i, None

    with ThreadPoolExecutor(max_workers=32) as pool:
        downloaded = list(pool.map(_download, range(len(items))))

    kept_items = []
    kept_images = []
    for i, img in downloaded:
        if img is not None:
            kept_items.append(items[i])
            kept_images.append(img)
    print(f"  downloaded {len(kept_images)}/{len(items)}")

    print("Embedding...")
    batch = 64
    chunks: list[torch.Tensor] = []
    for start in range(0, len(kept_images), batch):
        end = min(start + batch, len(kept_images))
        inputs = processor(images=kept_images[start:end], return_tensors="pt").to("cuda")
        with torch.no_grad():
            feats = model.get_image_features(**inputs)
        feats = feats / feats.norm(dim=-1, keepdim=True)
        chunks.append(feats.cpu())
        print(f"  embedded {end}/{len(kept_images)}")

    embeddings = torch.cat(chunks, dim=0).numpy().astype(np.float32)
    assert embeddings.shape == (len(kept_items), 512), embeddings.shape

    print("Writing to Volume...")
    np.savez(f"{CATALOG_DIR}/catalog.npz", embeddings=embeddings)
    with open(f"{CATALOG_DIR}/metadata.json", "w") as f:
        json.dump([item.to_metadata() for item in kept_items], f)
    volume.commit()

    elapsed = time.monotonic() - t0
    print(f"Done. {len(kept_items)} items embedded in {elapsed:.1f}s.")
    return {
        "items_requested": limit,
        "items_returned_by_bq": len(items),
        "items_embedded": len(kept_items),
        "elapsed_seconds": round(elapsed, 1),
    }


MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB cap on decoded base64 payload


def resolve_query_image(payload: dict, url_loader=None):
    """Validate a /match payload and return a PIL.Image.

    Exactly one of payload["image_url"] or payload["image_bytes"] must be set.
    image_bytes is base64-encoded JPEG/PNG, capped at MAX_IMAGE_BYTES.
    Raises fastapi.HTTPException(400) on any validation or decode error.
    """
    import base64
    from fastapi import HTTPException

    from src.embedding import load_image_from_bytes, load_image_from_url

    image_url = payload.get("image_url")
    image_bytes_b64 = payload.get("image_bytes")

    has_url = isinstance(image_url, str) and image_url
    has_bytes = isinstance(image_bytes_b64, str) and image_bytes_b64

    if has_url and has_bytes:
        raise HTTPException(status_code=400, detail="provide image_url OR image_bytes, not both")
    if not has_url and not has_bytes:
        raise HTTPException(status_code=400, detail="image_url or image_bytes is required")

    if has_bytes:
        try:
            raw = base64.b64decode(image_bytes_b64, validate=True)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"image_bytes is not valid base64: {e}")
        if len(raw) > MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"image_bytes exceeds {MAX_IMAGE_BYTES} byte cap",
            )
        try:
            return load_image_from_bytes(raw)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    loader = url_loader or load_image_from_url
    try:
        return loader(image_url, timeout=10)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"could not load image: {e}")


@app.cls(memory=2048, volumes={CATALOG_DIR: volume}, min_containers=1)
class MatchService:
    """Loads catalog + model once per container, serves match requests."""

    @modal.enter()
    def load(self):
        import json

        import numpy as np
        import torch

        from src.embedding import load_model

        print("Loading catalog from Volume...")
        npz = np.load(f"{CATALOG_DIR}/catalog.npz")
        self.catalog = torch.from_numpy(npz["embeddings"])
        with open(f"{CATALOG_DIR}/metadata.json") as f:
            self.metadata = json.load(f)
        print(f"  loaded {len(self.metadata)} items, embeddings shape {tuple(self.catalog.shape)}")

        print("Loading FashionCLIP (CPU)...")
        self.model, self.processor = load_model()

    @modal.fastapi_endpoint(method="POST")
    def match(self, payload: dict) -> dict:
        import torch

        from src.embedding import embed_images
        from src.similarity import top_k_matches
        from src.types import Match

        img = resolve_query_image(payload)
        top_k = int(payload.get("top_k", 10))

        with torch.no_grad():
            query_emb = embed_images(self.model, self.processor, [img]).numpy()[0]

        indices, scores = top_k_matches(query_emb, self.catalog.numpy(), k=top_k)
        matches = [
            Match(
                objectid=self.metadata[i]["objectid"],
                category=self.metadata[i].get("category"),
                category_1=self.metadata[i].get("category1"),
                image_url=self.metadata[i]["image_url"],
                product_url=self.metadata[i]["product_url"],
                brand=self.metadata[i].get("brand"),
                size=self.metadata[i].get("size"),
                price=self.metadata[i].get("price"),
                score=float(s),
            ).to_json()
            for i, s in zip(indices, scores)
        ]
        return {"matches": matches}
