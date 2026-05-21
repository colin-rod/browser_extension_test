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
