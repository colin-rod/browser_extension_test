from __future__ import annotations

from src.types import Match


def test_match_to_json_includes_all_fields():
    m = Match(
        objectid="abc",
        category_1="Sweater",
        image_url="https://img/1.jpg",
        product_url="https://www.sellpy.se/item/abc",
        brand="Acne",
        size="M",
        price=149.0,
        score=0.771,
    )
    j = m.to_json()
    assert j == {
        "objectid": "abc",
        "category_1": "Sweater",
        "image_url": "https://img/1.jpg",
        "product_url": "https://www.sellpy.se/item/abc",
        "brand": "Acne",
        "size": "M",
        "price": 149.0,
        "score": 0.771,
    }


def test_match_to_json_allows_null_brand_size_price():
    m = Match(
        objectid="abc",
        category_1="Sweater",
        image_url="https://img/1.jpg",
        product_url="https://www.sellpy.se/item/abc",
        brand=None,
        size=None,
        price=None,
        score=0.5,
    )
    j = m.to_json()
    assert j["brand"] is None
    assert j["size"] is None
    assert j["price"] is None


def test_match_to_json_allows_null_category_1():
    m = Match(
        objectid="abc",
        category_1=None,
        image_url="https://img/1.jpg",
        product_url="https://www.sellpy.se/item/abc",
        brand="Acne",
        size="M",
        price=149.0,
        score=0.5,
    )
    assert m.to_json()["category_1"] is None
