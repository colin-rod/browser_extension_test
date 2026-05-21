# Sellpy Visual Search Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working MVP of a Chrome+Firefox extension where right-clicking any image on the web shows visually similar items from a 10k-item Sellpy catalog subset, powered by a FashionCLIP endpoint deployed on Modal.

**Architecture:** Three independent units — (1) a one-shot Modal GPU job that queries BigQuery, embeds 10k Sellpy items with FashionCLIP, and writes `catalog.npz` + `metadata.json` to a Modal Volume; (2) a Modal CPU web endpoint that loads those files at startup, embeds incoming query images, and returns top-N matches via cosine similarity; (3) a single MV3 extension codebase that loads unpacked in both Chrome and Firefox and calls the endpoint from a right-click context menu.

**Tech Stack:** Python 3.11, Modal, FastAPI, PyTorch + transformers (FashionCLIP `patrickjohncyh/fashion-clip`), Google BigQuery Python client, NumPy. Vanilla JavaScript ES modules for the extension (no bundler). pytest for Python tests. Manual smoke checklists for the extension.

**Reference docs:** Spec at `docs/superpowers/specs/2026-05-20-sellpy-visual-search-extension-design.md`. Existing local sanity script at `test_fashion_clip.py` is the working starting point for the FashionCLIP embedding code.

---

## File Structure

```
browser_extension_test/
├── test_fashion_clip.py              # existing, untouched
├── pyproject.toml                    # new — Python deps + pytest config
├── modal_app.py                      # new — Modal app: embed_catalog (GPU) + match endpoint (CPU)
├── src/
│   ├── __init__.py
│   ├── catalog_query.py              # new — BigQuery → list[CatalogItem]
│   ├── embedding.py                  # new — FashionCLIP loader + embed_images()
│   ├── similarity.py                 # new — pure cosine top-K (testable, no model needed)
│   └── types.py                      # new — dataclasses: CatalogItem, Match
├── tests/
│   ├── __init__.py
│   ├── test_similarity.py            # new — unit tests for cosine top-K
│   └── test_lookup.test.js           # new — Node test for extension lookup module
├── extension/
│   ├── manifest.json                 # new — MV3, Chrome+Firefox
│   ├── background.js                 # new — context menu + endpoint call orchestration
│   ├── lookup.js                     # new — findSimilar(imageUrl) → Promise<Match[]>
│   ├── results.html                  # new — popup window markup
│   ├── results.js                    # new — render matches into results.html
│   ├── results.css                   # new — minimal styling
│   └── icons/icon128.png             # new — single icon (extension manifests require one)
└── docs/superpowers/
    ├── specs/2026-05-20-sellpy-visual-search-extension-design.md   # existing
    └── plans/2026-05-21-sellpy-visual-search-extension.md          # this file
```

**File responsibilities (one purpose each):**
- `src/types.py` — typed shapes shared across modules
- `src/catalog_query.py` — talk to BigQuery, return typed items
- `src/embedding.py` — load FashionCLIP, embed PIL images, return normalized tensor
- `src/similarity.py` — given a query embedding and a catalog matrix, return top-K indices + scores (pure numpy/torch, no model — this is where the testable logic lives)
- `modal_app.py` — Modal deployment glue: defines two Modal functions (`embed_catalog` GPU job, `match` CPU web endpoint), wires `catalog_query` + `embedding` + `similarity` together
- `extension/background.js` — service worker, registers the context menu, opens results window
- `extension/lookup.js` — single async function `findSimilar(imageUrl)` that POSTs to the Modal endpoint and returns matches
- `extension/results.js` — reads matches from `chrome.storage.session`, renders them

---

## Conventions

**Python:**
- Use `uv` for dep management if available, else `pip`. Both work with `pyproject.toml`.
- Type hints on every function signature in `src/`.
- `from __future__ import annotations` at the top of each module.

**Tests:**
- Python: `pytest`, no fixtures unless needed, plain `assert`.
- JS: Node's built-in `node:test` runner — no Jest/Vitest install.
- Tests that require the FashionCLIP model are marked `@pytest.mark.slow` and skipped by default. Run with `pytest -m slow` to include them.

**Commits:**
- Conventional commits style (`feat:`, `chore:`, `test:`, `docs:`).
- Commit at the end of each task. One task = one logical commit.

---

## Task 1: Project scaffolding

**Files:**
- Create: `pyproject.toml`
- Create: `src/__init__.py` (empty)
- Create: `tests/__init__.py` (empty)
- Create: `.gitignore`

- [ ] **Step 1: Initialize git**

Run:
```bash
cd /Users/colinr/Projects/browser_extension_test
git init
git add test_fashion_clip.py docs/
git commit -m "chore: initial commit with sanity script and design spec"
```

Expected: a fresh repo with the existing script and spec committed.

- [ ] **Step 2: Write `.gitignore`**

Create `/Users/colinr/Projects/browser_extension_test/.gitignore`:
```
.venv/
__pycache__/
*.pyc
.pytest_cache/
.modal/
catalog.npz
metadata.json
*.local
.DS_Store
```

- [ ] **Step 3: Write `pyproject.toml`**

Create `/Users/colinr/Projects/browser_extension_test/pyproject.toml`:
```toml
[project]
name = "sellpy-visual-search"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "modal>=0.64",
    "fastapi>=0.110",
    "torch>=2.2",
    "transformers>=4.40",
    "pillow>=10.0",
    "requests>=2.31",
    "numpy>=1.26",
    "google-cloud-bigquery>=3.20",
    "db-dtypes>=1.2",
    "pyarrow>=14.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0"]

[tool.pytest.ini_options]
markers = [
    "slow: tests that load the FashionCLIP model (skipped by default)",
]
addopts = "-m 'not slow'"
testpaths = ["tests"]
```

- [ ] **Step 4: Create empty package files**

Create `/Users/colinr/Projects/browser_extension_test/src/__init__.py` with content:
```python
```

Create `/Users/colinr/Projects/browser_extension_test/tests/__init__.py` with content:
```python
```

- [ ] **Step 5: Install deps**

Run:
```bash
cd /Users/colinr/Projects/browser_extension_test
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Expected: installs without errors. `pip list` shows modal, torch, transformers, google-cloud-bigquery.

- [ ] **Step 6: Verify pytest works**

Run:
```bash
pytest
```

Expected: `no tests ran in 0.XXs` — pytest discovered nothing, that's fine.

- [ ] **Step 7: Commit**

Run:
```bash
git add .gitignore pyproject.toml src/__init__.py tests/__init__.py
git commit -m "chore: project scaffolding (pyproject, gitignore, package skeleton)"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/types.py`

- [ ] **Step 1: Write the types module**

Create `/Users/colinr/Projects/browser_extension_test/src/types.py`:
```python
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any


@dataclass(frozen=True)
class CatalogItem:
    """One row from BigQuery, ready to embed and serve."""
    objectid: str
    image_url: str
    product_url: str
    category: str
    category1: str | None
    brand: str | None
    demography: str | None
    size: str | None
    price: float | None

    def to_metadata(self) -> dict[str, Any]:
        """Drop into metadata.json (omits nothing — all fields are JSON-safe)."""
        return asdict(self)


@dataclass(frozen=True)
class Match:
    """One similarity result, returned to the extension."""
    objectid: str
    category: str
    image_url: str
    product_url: str
    score: float

    def to_json(self) -> dict[str, Any]:
        return asdict(self)
```

- [ ] **Step 2: Sanity-check imports**

Run:
```bash
python -c "from src.types import CatalogItem, Match; print('ok')"
```

Expected: prints `ok`.

- [ ] **Step 3: Commit**

Run:
```bash
git add src/types.py
git commit -m "feat: add CatalogItem and Match dataclasses"
```

---

## Task 3: Cosine similarity (test-first)

This is the pure-logic core — no model, no network. TDD it.

**Files:**
- Create: `tests/test_similarity.py`
- Create: `src/similarity.py`

- [ ] **Step 1: Write the failing test**

Create `/Users/colinr/Projects/browser_extension_test/tests/test_similarity.py`:
```python
from __future__ import annotations

import numpy as np
import pytest

from src.similarity import top_k_matches


def _normalize(x: np.ndarray) -> np.ndarray:
    return x / np.linalg.norm(x, axis=-1, keepdims=True)


def test_top_k_returns_self_first_when_query_is_in_catalog():
    rng = np.random.default_rng(0)
    catalog = _normalize(rng.standard_normal((5, 16)).astype(np.float32))
    query = catalog[2]
    indices, scores = top_k_matches(query, catalog, k=3)
    assert indices[0] == 2
    assert scores[0] == pytest.approx(1.0, abs=1e-5)
    assert len(indices) == 3
    assert len(scores) == 3


def test_top_k_returns_descending_scores():
    rng = np.random.default_rng(1)
    catalog = _normalize(rng.standard_normal((10, 16)).astype(np.float32))
    query = _normalize(rng.standard_normal((16,)).astype(np.float32))
    _, scores = top_k_matches(query, catalog, k=5)
    for i in range(len(scores) - 1):
        assert scores[i] >= scores[i + 1]


def test_top_k_clamps_k_to_catalog_size():
    rng = np.random.default_rng(2)
    catalog = _normalize(rng.standard_normal((3, 16)).astype(np.float32))
    query = _normalize(rng.standard_normal((16,)).astype(np.float32))
    indices, scores = top_k_matches(query, catalog, k=10)
    assert len(indices) == 3
    assert len(scores) == 3


def test_top_k_rejects_empty_catalog():
    query = np.zeros(16, dtype=np.float32)
    catalog = np.zeros((0, 16), dtype=np.float32)
    with pytest.raises(ValueError):
        top_k_matches(query, catalog, k=5)
```

- [ ] **Step 2: Run and watch it fail**

Run:
```bash
pytest tests/test_similarity.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'src.similarity'`.

- [ ] **Step 3: Write the implementation**

Create `/Users/colinr/Projects/browser_extension_test/src/similarity.py`:
```python
from __future__ import annotations

import numpy as np


def top_k_matches(
    query: np.ndarray,
    catalog: np.ndarray,
    k: int,
) -> tuple[list[int], list[float]]:
    """Return (indices, scores) of the k most similar catalog rows to `query`.

    Both `query` and rows of `catalog` are expected to be L2-normalized so
    that dot product equals cosine similarity. `query` is shape (D,),
    `catalog` is shape (N, D). k is clamped to N.
    """
    if catalog.shape[0] == 0:
        raise ValueError("catalog is empty")

    k = min(k, catalog.shape[0])
    scores = catalog @ query  # shape (N,)
    # argpartition for speed, then sort the top-k descending
    top_unsorted = np.argpartition(-scores, k - 1)[:k]
    top_sorted = top_unsorted[np.argsort(-scores[top_unsorted])]
    return top_sorted.tolist(), scores[top_sorted].tolist()
```

- [ ] **Step 4: Run tests and watch them pass**

Run:
```bash
pytest tests/test_similarity.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

Run:
```bash
git add tests/test_similarity.py src/similarity.py
git commit -m "feat: cosine top-K similarity with tests"
```

---

## Task 4: BigQuery catalog query

The query is fixed (you confirmed it). Logic: build a query, run it, return a list of `CatalogItem`. No tests — this is a thin wrapper over the BQ client and our value is in the integration, not unit testing the wrapper.

**Files:**
- Create: `src/catalog_query.py`

- [ ] **Step 1: Write the module**

Create `/Users/colinr/Projects/browser_extension_test/src/catalog_query.py`:
```python
from __future__ import annotations

from google.cloud import bigquery

from src.types import CatalogItem

# Confirmed schema (2026-05-21):
#   dw_tables.aggregated_item — objectid, first_photo, category_lvl_0,
#   category_lvl_1, createdat, brand, demography, size, last_price_sek,
#   itemstatus. 'utlagd' = listed.
_QUERY_TEMPLATE = """
SELECT
    objectid,
    first_photo AS image_url,
    CONCAT('https://www.sellpy.se/item/', objectid) AS product_url,
    category_lvl_0 AS category,
    category_lvl_1 AS category1,
    brand,
    demography,
    size,
    CAST(last_price_sek AS FLOAT64) AS price
FROM `dw_tables.aggregated_item`
WHERE itemstatus = 'utlagd'
  AND category_lvl_0 = 'Clothing'
  AND first_photo IS NOT NULL
  AND first_photo != ''
ORDER BY createdat DESC
LIMIT @limit
"""


def fetch_catalog(limit: int, project: str | None = None) -> list[CatalogItem]:
    """Fetch `limit` most recent listed clothing items from BigQuery."""
    client = bigquery.Client(project=project) if project else bigquery.Client()
    job = client.query(
        _QUERY_TEMPLATE,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("limit", "INT64", limit),
            ],
        ),
    )
    rows = job.result()
    items: list[CatalogItem] = []
    for row in rows:
        items.append(
            CatalogItem(
                objectid=row["objectid"],
                image_url=row["image_url"],
                product_url=row["product_url"],
                category=row["category"],
                category1=row.get("category1"),
                brand=row.get("brand"),
                demography=row.get("demography"),
                size=row.get("size"),
                price=row.get("price"),
            )
        )
    return items
```

- [ ] **Step 2: Sanity-check import (does not run the query)**

Run:
```bash
python -c "from src.catalog_query import fetch_catalog; print('ok')"
```

Expected: prints `ok`.

- [ ] **Step 3: Commit**

Run:
```bash
git add src/catalog_query.py
git commit -m "feat: BigQuery catalog fetch for listed clothing"
```

---

## Task 5: FashionCLIP embedding module

Extract the embedding logic from `test_fashion_clip.py` into a reusable module. Mark its test `@pytest.mark.slow` (downloads 600MB on first run).

**Files:**
- Create: `src/embedding.py`

- [ ] **Step 1: Write the module**

Create `/Users/colinr/Projects/browser_extension_test/src/embedding.py`:
```python
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
```

- [ ] **Step 2: Sanity-check import**

Run:
```bash
python -c "from src.embedding import load_model, embed_images; print('ok')"
```

Expected: prints `ok`.

- [ ] **Step 3: Commit**

Run:
```bash
git add src/embedding.py
git commit -m "feat: extract FashionCLIP loader and embed_images into src/"
```

---

## Task 6: Modal app — scaffold

Build the Modal app structure first, with both functions stubbed. Verifies the deployment story works end-to-end before we wire in the real logic.

**Files:**
- Create: `modal_app.py`

- [ ] **Step 1: Write the scaffold**

Create `/Users/colinr/Projects/browser_extension_test/modal_app.py`:
```python
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


@app.function(gpu="T4", timeout=60 * 60, volumes={CATALOG_DIR: volume})
def embed_catalog(limit: int = 10_000) -> dict:
    """One-shot: query BigQuery, embed N items, write to Volume."""
    return {"status": "not_implemented", "limit": limit}


@app.function(memory=2048, volumes={CATALOG_DIR: volume})
@modal.fastapi_endpoint(method="POST")
def match(payload: dict) -> dict:
    """Embed query image, return top-K Sellpy matches."""
    return {"status": "not_implemented", "echo": payload}
```

- [ ] **Step 2: Verify Modal sees both functions**

Run:
```bash
modal token new   # if you haven't authenticated before
modal app list
```

If you haven't deployed yet, this is informational. Then dry-run:
```bash
python -c "import modal_app; print([f for f in dir(modal_app) if not f.startswith('_')])"
```

Expected: prints a list containing `embed_catalog` and `match`.

- [ ] **Step 3: Deploy the scaffold**

Run:
```bash
modal deploy modal_app.py
```

Expected: output ends with two URLs — one for the `match` web endpoint, and confirmation that `embed_catalog` is deployed as a scheduled/callable function. Save the `match` URL — you'll need it for the extension.

- [ ] **Step 4: Hit the match endpoint**

Run (substitute the URL from Step 3):
```bash
curl -X POST "https://YOUR-USERNAME--sellpy-visual-search-match.modal.run" \
     -H "Content-Type: application/json" \
     -d '{"image_url": "https://example.com/x.jpg"}'
```

Expected: `{"status":"not_implemented","echo":{"image_url":"https://example.com/x.jpg"}}`

- [ ] **Step 5: Commit**

Run:
```bash
git add modal_app.py
git commit -m "feat: Modal app scaffold (embed_catalog + match endpoint stubs)"
```

---

## Task 7: Modal app — embedding job

Wire the embedding logic into `embed_catalog`. After this task, running `modal run modal_app.py::embed_catalog --limit=20` should populate the Volume with a 20-item embedding file.

**Files:**
- Modify: `modal_app.py`

- [ ] **Step 1: Replace the `embed_catalog` stub**

Replace the body of `embed_catalog` in `/Users/colinr/Projects/browser_extension_test/modal_app.py` with:

```python
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
    from src.embedding import embed_images, load_image_from_url, load_model

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
```

- [ ] **Step 2: Create the Modal secret for BigQuery**

You need a GCP service account JSON with BigQuery read access to `dw_tables.aggregated_item`. Get the JSON from whoever manages Sellpy GCP access. Then:

```bash
modal secret create gcp-bigquery \
    GOOGLE_APPLICATION_CREDENTIALS_JSON='<paste the full service account JSON here>'
```

Then update `src/catalog_query.py` to read credentials from the env var — add at top of `fetch_catalog`:

Modify `/Users/colinr/Projects/browser_extension_test/src/catalog_query.py`:

Replace:
```python
def fetch_catalog(limit: int, project: str | None = None) -> list[CatalogItem]:
    """Fetch `limit` most recent listed clothing items from BigQuery."""
    client = bigquery.Client(project=project) if project else bigquery.Client()
```

With:
```python
def fetch_catalog(limit: int, project: str | None = None) -> list[CatalogItem]:
    """Fetch `limit` most recent listed clothing items from BigQuery."""
    import json
    import os

    creds_json = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if creds_json:
        from google.oauth2 import service_account

        info = json.loads(creds_json)
        credentials = service_account.Credentials.from_service_account_info(info)
        client = bigquery.Client(credentials=credentials, project=project or info.get("project_id"))
    else:
        client = bigquery.Client(project=project) if project else bigquery.Client()
```

Add `google-auth>=2.0` to `dependencies` in `pyproject.toml` if pip complains; otherwise it comes transitively with `google-cloud-bigquery`.

- [ ] **Step 3: Deploy and run a 20-item smoke test**

Run:
```bash
modal deploy modal_app.py
modal run modal_app.py::embed_catalog --limit=20
```

Expected:
- Logs print "Fetching up to 20 items...", "downloaded X/20", "embedded X/X", "Done."
- Return value at end: `{"items_requested": 20, "items_returned_by_bq": 20, "items_embedded": >=18, ...}` — allow for 1–2 image download failures.

- [ ] **Step 4: Verify the Volume has the files**

Run:
```bash
modal volume ls sellpy-visual-search-catalog
```

Expected: lists `catalog.npz` and `metadata.json`.

- [ ] **Step 5: Commit**

Run:
```bash
git add modal_app.py src/catalog_query.py
git commit -m "feat: wire embed_catalog Modal job to BigQuery + FashionCLIP"
```

---

## Task 8: Modal app — match endpoint

Now make `match` actually do similarity search using the files we just wrote to the Volume.

**Files:**
- Modify: `modal_app.py`

- [ ] **Step 1: Replace the `match` stub**

Replace the `match` function in `/Users/colinr/Projects/browser_extension_test/modal_app.py` with:

```python
@app.cls(memory=2048, volumes={CATALOG_DIR: volume}, min_containers=0)
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
        import numpy as np
        import torch
        from fastapi import HTTPException

        from src.embedding import embed_images, load_image_from_url
        from src.similarity import top_k_matches
        from src.types import Match

        image_url = payload.get("image_url")
        if not image_url or not isinstance(image_url, str):
            raise HTTPException(status_code=400, detail="image_url is required")
        top_k = int(payload.get("top_k", 10))

        try:
            img = load_image_from_url(image_url, timeout=10)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"could not load image: {e}")

        with torch.no_grad():
            query_emb = embed_images(self.model, self.processor, [img]).numpy()[0]

        indices, scores = top_k_matches(query_emb, self.catalog.numpy(), k=top_k)
        matches = [
            Match(
                objectid=self.metadata[i]["objectid"],
                category=self.metadata[i]["category"],
                image_url=self.metadata[i]["image_url"],
                product_url=self.metadata[i]["product_url"],
                score=float(s),
            ).to_json()
            for i, s in zip(indices, scores)
        ]
        return {"matches": matches}
```

Remove the old standalone `@app.function ... def match(...)` definition entirely. The class above replaces it. The reason for using `@app.cls` with `@modal.enter()`: we want the catalog and model loaded **once** when the container starts, not on every request.

- [ ] **Step 2: Deploy**

Run:
```bash
modal deploy modal_app.py
```

Expected: deploys successfully, prints a new URL for the `match` endpoint. Note: the URL pattern with `@app.cls` is `https://USERNAME--sellpy-visual-search-matchservice-match.modal.run`. Copy this — it's what the extension will call.

- [ ] **Step 3: Smoke-test the endpoint with a known image**

Run (use any clothing image URL — even one from the 20 items you embedded earlier; check the Volume's `metadata.json` if needed):
```bash
curl -X POST "https://YOUR-URL-HERE" \
     -H "Content-Type: application/json" \
     -d '{"image_url": "https://image.hm.com/assets/hm/0f/72/0f727c46982cb25224f35d54ef0ed3bfe02b6271.jpg?imwidth=2160", "top_k": 5}'
```

Expected: JSON with a `matches` array of 5 items, each with `objectid`, `category`, `image_url`, `product_url`, `score`. The first call may take 10–30s (cold start); subsequent calls <2s.

- [ ] **Step 4: Sanity-check match quality manually**

The HM URL above is a dress. Inspect the response — are the top matches dresses or visually similar clothing? They don't have to be perfect (we only have 20 items in the catalog right now) but they shouldn't be obviously random.

If matches look broken (e.g. scores all near zero, or all the same), investigate before continuing. Most likely causes: catalog wasn't normalized, or the query embedding wasn't normalized.

- [ ] **Step 5: Commit**

Run:
```bash
git add modal_app.py
git commit -m "feat: wire match endpoint with cached catalog + model"
```

---

## Task 9: Scale the catalog to 10k

Now that the pipeline works on 20 items, run it for real.

**Files:** none — this is an operational task.

- [ ] **Step 1: Kick off the 10k job**

Run:
```bash
modal run modal_app.py::embed_catalog --limit=10000
```

Expected: runs for ~30–60 minutes on a T4. Logs print download progress and embed progress. Final summary shows `items_embedded` close to 10000 (allow up to ~10% download failures).

If it runs longer than 90 minutes, something is wrong (likely image downloads timing out repeatedly). Reduce `max_workers` in the ThreadPoolExecutor or shorten the per-image timeout.

- [ ] **Step 2: Verify the new catalog**

Run:
```bash
modal volume ls sellpy-visual-search-catalog
```

Expected: `catalog.npz` and `metadata.json` exist, and `catalog.npz` is ~20MB (10k × 512 × 4 bytes).

- [ ] **Step 3: Restart the match service to pick up the new catalog**

`@modal.enter()` only runs at container startup, so existing warm containers still have the old 20-item catalog cached. Force a fresh container:

```bash
modal app stop sellpy-visual-search
modal deploy modal_app.py
```

- [ ] **Step 4: Hit the endpoint again, expect better matches**

Repeat the curl from Task 8 Step 3. Now with 10k items, the top matches should look much more relevant for a dress query.

- [ ] **Step 5: Save the endpoint URL**

Write the URL to a tracking file so the extension code references one source of truth:

Create `/Users/colinr/Projects/browser_extension_test/extension/config.js`:
```javascript
// The Modal match endpoint. Update if redeployed under a different name.
export const ENDPOINT_URL = "https://YOUR-USERNAME--sellpy-visual-search-matchservice-match.modal.run";
```

(Replace `YOUR-USERNAME` with the actual URL from Modal.)

- [ ] **Step 6: Commit**

Run:
```bash
git add extension/config.js
git commit -m "feat: scale catalog to 10k items, pin endpoint URL"
```

---

## Task 10: Extension — manifest

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/icons/icon128.png`

- [ ] **Step 1: Provide an icon**

Any 128×128 PNG works. Quickest path: download Sellpy's favicon, upscale, or use a placeholder:
```bash
curl -L "https://www.sellpy.se/favicon.ico" -o /tmp/sellpy.ico
# Convert to 128x128 PNG. macOS:
sips -s format png -z 128 128 /tmp/sellpy.ico --out /Users/colinr/Projects/browser_extension_test/extension/icons/icon128.png
```

If `sips` complains, use any 128×128 PNG. The icon doesn't affect functionality.

- [ ] **Step 2: Write manifest.json**

Create `/Users/colinr/Projects/browser_extension_test/extension/manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "Sellpy Visual Search",
  "version": "0.1.0",
  "description": "Right-click any image to find visually similar items on Sellpy.",
  "permissions": ["contextMenus", "storage"],
  "host_permissions": [
    "https://*.modal.run/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "icons": {
    "128": "icons/icon128.png"
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "sellpy-visual-search@sellpy.com",
      "strict_min_version": "115.0"
    }
  }
}
```

Notes for the implementer:
- `"type": "module"` on the service worker so we can use `import` in `background.js` and `lookup.js`.
- `host_permissions` is wildcard for Modal because deploys could rotate to a different sub-URL. If you want to lock it down, replace with the exact endpoint host.
- `browser_specific_settings.gecko.id` is required by Firefox MV3 unpacked add-ons that use `storage`.

- [ ] **Step 3: Commit**

Run:
```bash
git add extension/manifest.json extension/icons/icon128.png
git commit -m "feat: extension manifest (MV3, Chrome+Firefox)"
```

---

## Task 11: Extension — lookup module

This is pure logic, testable with Node's built-in test runner. TDD-light: one happy-path test, one error test.

**Files:**
- Create: `extension/lookup.js`
- Create: `tests/test_lookup.test.js`

- [ ] **Step 1: Write the failing test**

Create `/Users/colinr/Projects/browser_extension_test/tests/test_lookup.test.js`:
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";

import { findSimilarWith } from "../extension/lookup.js";

test("findSimilarWith returns matches on success", async () => {
    const fakeMatches = [
        { objectid: "abc", category: "Dresses", image_url: "u1", product_url: "p1", score: 0.9 },
    ];
    const fakeFetch = async (url, opts) => ({
        ok: true,
        status: 200,
        json: async () => ({ matches: fakeMatches }),
    });
    const result = await findSimilarWith(fakeFetch, "https://endpoint", "https://q.jpg", 5);
    assert.deepEqual(result, fakeMatches);
});

test("findSimilarWith throws on non-OK response", async () => {
    const fakeFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await assert.rejects(
        () => findSimilarWith(fakeFetch, "https://endpoint", "https://q.jpg", 5),
        /500/,
    );
});

test("findSimilarWith throws on missing matches field", async () => {
    const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
    await assert.rejects(
        () => findSimilarWith(fakeFetch, "https://endpoint", "https://q.jpg", 5),
    );
});
```

- [ ] **Step 2: Run and watch it fail**

Run:
```bash
cd /Users/colinr/Projects/browser_extension_test
node --test tests/test_lookup.test.js
```

Expected: FAIL — `Cannot find module '../extension/lookup.js'`.

- [ ] **Step 3: Write the implementation**

Create `/Users/colinr/Projects/browser_extension_test/extension/lookup.js`:
```javascript
import { ENDPOINT_URL } from "./config.js";

/**
 * Find Sellpy items visually similar to the given image URL.
 * @param {string} imageUrl
 * @param {number} topK
 * @returns {Promise<Array<{objectid: string, category: string, image_url: string, product_url: string, score: number}>>}
 */
export async function findSimilar(imageUrl, topK = 10) {
    return findSimilarWith(fetch, ENDPOINT_URL, imageUrl, topK);
}

/**
 * Injectable version for testing.
 */
export async function findSimilarWith(fetchImpl, endpointUrl, imageUrl, topK) {
    const response = await fetchImpl(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, top_k: topK }),
    });
    if (!response.ok) {
        throw new Error(`Endpoint returned ${response.status}`);
    }
    const body = await response.json();
    if (!Array.isArray(body.matches)) {
        throw new Error("Endpoint response missing matches array");
    }
    return body.matches;
}
```

- [ ] **Step 4: Run tests and watch them pass**

Run:
```bash
node --test tests/test_lookup.test.js
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

Run:
```bash
git add extension/lookup.js tests/test_lookup.test.js
git commit -m "feat: extension lookup module with injectable fetch tests"
```

---

## Task 12: Extension — background service worker

**Files:**
- Create: `extension/background.js`

- [ ] **Step 1: Write the background script**

Create `/Users/colinr/Projects/browser_extension_test/extension/background.js`:
```javascript
import { findSimilar } from "./lookup.js";

const MENU_ID = "sellpy-find-similar";

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: MENU_ID,
        title: "Find on Sellpy",
        contexts: ["image"],
    });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
    if (info.menuItemId !== MENU_ID || !info.srcUrl) return;

    const requestId = crypto.randomUUID();
    // Stash a loading state immediately so the popup can read it.
    await chrome.storage.session.set({
        [requestId]: { status: "loading", queryImage: info.srcUrl },
    });

    // Open the results window right away — it'll show a spinner while we fetch.
    chrome.windows.create({
        url: chrome.runtime.getURL(`results.html?id=${requestId}`),
        type: "popup",
        width: 480,
        height: 720,
    });

    try {
        const matches = await findSimilar(info.srcUrl, 10);
        await chrome.storage.session.set({
            [requestId]: { status: "ok", queryImage: info.srcUrl, matches },
        });
    } catch (err) {
        await chrome.storage.session.set({
            [requestId]: { status: "error", queryImage: info.srcUrl, error: String(err) },
        });
    }
});
```

Notes for the implementer:
- We open the results window **before** the fetch resolves so the user sees feedback immediately. The window polls `chrome.storage.session` for state updates (see Task 13).
- `chrome.storage.session` is in-memory, cleared on browser restart, and ideal for handoff between the service worker and the popup window.
- We pass a `requestId` via the URL so multiple right-clicks don't stomp on each other.

- [ ] **Step 2: Commit**

Run:
```bash
git add extension/background.js
git commit -m "feat: background script with context menu + results window"
```

---

## Task 13: Extension — results window

**Files:**
- Create: `extension/results.html`
- Create: `extension/results.js`
- Create: `extension/results.css`

- [ ] **Step 1: Write results.html**

Create `/Users/colinr/Projects/browser_extension_test/extension/results.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>Sellpy matches</title>
    <link rel="stylesheet" href="results.css" />
</head>
<body>
    <header>
        <h1>Visually similar on Sellpy</h1>
        <div id="query"></div>
    </header>
    <main id="results">
        <p class="status">Loading...</p>
    </main>
    <script src="results.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: Write results.css**

Create `/Users/colinr/Projects/browser_extension_test/extension/results.css`:
```css
* { box-sizing: border-box; }
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;
    margin: 0;
    padding: 16px;
    background: #fafafa;
    color: #222;
}
header h1 { font-size: 16px; margin: 0 0 8px; }
#query img { max-width: 96px; max-height: 96px; border-radius: 4px; display: block; }
#query { margin-bottom: 16px; }
.status { color: #888; }
.grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}
.card {
    background: white;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
}
.card img { width: 100%; height: 200px; object-fit: cover; }
.card .meta { padding: 8px 10px; font-size: 12px; }
.card .meta .category { color: #666; }
.card .meta .score { color: #999; font-size: 11px; margin-top: 4px; }
.card:hover { border-color: #999; }
```

- [ ] **Step 3: Write results.js**

Create `/Users/colinr/Projects/browser_extension_test/extension/results.js`:
```javascript
const params = new URLSearchParams(window.location.search);
const requestId = params.get("id");

const queryEl = document.getElementById("query");
const resultsEl = document.getElementById("results");

if (!requestId) {
    resultsEl.innerHTML = `<p class="status">Missing request id.</p>`;
} else {
    render(); // initial
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "session" && changes[requestId]) {
            render();
        }
    });
}

async function render() {
    const data = (await chrome.storage.session.get(requestId))[requestId];
    if (!data) {
        resultsEl.innerHTML = `<p class="status">No data.</p>`;
        return;
    }

    if (data.queryImage) {
        queryEl.innerHTML = `<img src="${escapeHtml(data.queryImage)}" alt="Query" />`;
    }

    if (data.status === "loading") {
        resultsEl.innerHTML = `<p class="status">Finding matches...</p>`;
        return;
    }
    if (data.status === "error") {
        resultsEl.innerHTML = `<p class="status">Couldn't find matches. ${escapeHtml(data.error || "Try again.")}</p>`;
        return;
    }
    if (data.status === "ok") {
        if (!data.matches || data.matches.length === 0) {
            resultsEl.innerHTML = `<p class="status">No matches.</p>`;
            return;
        }
        resultsEl.innerHTML = `<div class="grid">${data.matches.map(renderCard).join("")}</div>`;
    }
}

function renderCard(m) {
    return `
        <a class="card" href="${escapeHtml(m.product_url)}" target="_blank" rel="noopener">
            <img src="${escapeHtml(m.image_url)}" alt="${escapeHtml(m.category)}" />
            <div class="meta">
                <div class="category">${escapeHtml(m.category)}</div>
                <div class="score">similarity ${(m.score).toFixed(3)}</div>
            </div>
        </a>
    `;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
}
```

- [ ] **Step 4: Commit**

Run:
```bash
git add extension/results.html extension/results.js extension/results.css
git commit -m "feat: results window markup, styles, and renderer"
```

---

## Task 14: Manual smoke test in Chrome

**Files:** none — manual test.

- [ ] **Step 1: Load the extension**

In Chrome:
1. Go to `chrome://extensions`
2. Toggle "Developer mode" on (top right)
3. Click "Load unpacked"
4. Select `/Users/colinr/Projects/browser_extension_test/extension/`

Expected: extension appears in the list with no errors. Click "service worker" link under the extension to confirm `background.js` started cleanly (no red errors in the console).

- [ ] **Step 2: Test the happy path**

1. Open `https://www2.hm.com/sv_se/dam.html` (or any image-heavy page)
2. Right-click a clothing image
3. Click "Find on Sellpy"

Expected:
- A popup window opens within 1 second showing "Finding matches..."
- Within 3–10 seconds (cold start may be slower), it shows a grid of 10 Sellpy items
- Each result has an image, category, similarity score
- Clicking a result opens a Sellpy product page in a new tab

- [ ] **Step 3: Test error path**

1. In Chrome, right-click on a *broken* image (or a tiny 1×1 tracking pixel)
2. Click "Find on Sellpy"

Expected: the popup opens with "Couldn't find matches. Error: ...". The extension does not crash; the service worker stays alive (refresh `chrome://extensions` — no error banner).

- [ ] **Step 4: Test on a totally different site**

Right-click any image on a news article, Wikipedia, or Reddit. Verify the menu item appears and the flow works.

- [ ] **Step 5: Note any issues**

If anything looks broken (UI glitches, slow responses, irrelevant matches), document in a `notes.md` scratch file. Don't fix yet — pass through Firefox first, then triage together.

---

## Task 15: Manual smoke test in Firefox

**Files:** none — manual test.

- [ ] **Step 1: Load as temporary add-on**

In Firefox:
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on..."
3. Select `/Users/colinr/Projects/browser_extension_test/extension/manifest.json`

Expected: add-on appears with no errors. Click "Inspect" to confirm `background.js` started cleanly.

- [ ] **Step 2: Repeat the happy path**

Repeat Task 14 Step 2 in Firefox.

Expected: same flow works. Right-click "Find on Sellpy" → popup opens → results render.

- [ ] **Step 3: Note Firefox-specific issues**

Common things to check:
- Does the popup window open at the right size? (Firefox may handle `chrome.windows.create` slightly differently)
- Does `chrome.storage.session` work? (Firefox 115+ supports it; if you're on older Firefox, it won't — note as a known limitation)
- Do icons render in the toolbar?

Document any differences in `notes.md`. Decide which are blocking, which are deferred.

---

## Task 16: README for testers

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

Create `/Users/colinr/Projects/browser_extension_test/README.md`:
```markdown
# Sellpy Visual Search — MVP

Right-click any image on the web → find visually similar items on Sellpy.

## How to install (testers)

### Chrome
1. Download or clone this repo.
2. Open `chrome://extensions`.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select the `extension/` folder.
5. Right-click any image on the web → "Find on Sellpy".

### Firefox
1. Download or clone this repo.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select `extension/manifest.json`.
5. Right-click any image on the web → "Find on Sellpy".

**Note:** Firefox temporary add-ons unload when Firefox closes. Re-load on each restart.

## How it works

The extension sends the image URL to a Modal-hosted Python endpoint, which embeds the image with FashionCLIP and finds the most similar items in a 10k-item subset of Sellpy's current listings.

## Limitations (MVP)

- Catalog is only 10k items (out of 10M).
- Endpoint cold start can be slow (~10–30s on first query after idle).
- No retry on errors — try again if a match fails.
- Sites with strict hotlink protection may block our server from fetching the query image.

## Development

See `docs/superpowers/specs/` and `docs/superpowers/plans/` for the design and implementation plan.
```

- [ ] **Step 2: Commit**

Run:
```bash
git add README.md
git commit -m "docs: add tester-facing README"
```

---

## Self-review notes

I checked the plan against the spec end-to-end. Everything in the spec maps to a task:

| Spec section | Implemented in |
|---|---|
| Embedding job (`embed_catalog.py`) | Tasks 4, 5, 6, 7, 9 |
| Inference endpoint (`endpoint.py` in spec → `match` in `modal_app.py`) | Tasks 6, 8 |
| Browser extension with context menu | Tasks 10, 11, 12 |
| Results popup window | Task 13 |
| `lookup.js` abstraction | Task 11 |
| Chrome + Firefox unpacked install | Tasks 14, 15 |
| Error handling at each layer | Embedding: Task 7 (skip + log); endpoint: Task 8 (400/500 with messages); extension: Tasks 12, 13 (status field in storage, error rendering) |
| Testing checklist (smoke tests) | Tasks 14, 15 |
| README for testers | Task 16 |
| Cosine similarity in-memory | Task 3 (unit tested) |
| BigQuery query | Task 4 |

No placeholders found in the plan. Type/name consistency check: `findSimilar` / `findSimilarWith` consistent across Tasks 11 and 12. `Match` shape (`objectid`, `category`, `image_url`, `product_url`, `score`) consistent across Tasks 2, 8, 11, 13.

One area where I made a judgment call worth flagging: Task 7's BigQuery auth uses a Modal secret with a service account JSON. If you'd rather use a different auth flow (e.g. a personal `gcloud auth application-default login` token mounted into the container), Task 7 needs adjustment. Flag before starting Task 7.
