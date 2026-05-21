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
