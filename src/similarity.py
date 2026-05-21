from __future__ import annotations

import numpy as np


def top_k_matches(
    query: np.ndarray,
    catalog: np.ndarray,
    k: int,
) -> tuple[list[int], list[float]]:
    """Return (indices, scores) of the k most similar catalog rows to query.

    Both query and rows of catalog must be L2-normalized so dot product == cosine similarity.
    query is shape (D,), catalog is shape (N, D). k is clamped to N.
    """
    if catalog.shape[0] == 0:
        raise ValueError("catalog is empty")

    k = min(k, catalog.shape[0])
    scores = catalog @ query  # shape (N,)
    top_unsorted = np.argpartition(-scores, k - 1)[:k]
    top_sorted = top_unsorted[np.argsort(-scores[top_unsorted])]
    return top_sorted.tolist(), scores[top_sorted].tolist()
