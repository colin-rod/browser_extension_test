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
