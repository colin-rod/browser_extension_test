from __future__ import annotations

from google.cloud import bigquery

from src.types import CatalogItem

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
FROM `analytics-309907.dw_newbusiness.visual_search_catalog`
ORDER BY createdat DESC
LIMIT @limit
"""


def fetch_catalog(limit: int, project: str | None = None) -> list[CatalogItem]:
    """Fetch `limit` most recent listed clothing items from BigQuery."""
    import json
    import os

    creds_json = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if creds_json:
        from google.oauth2 import service_account

        info = json.loads(creds_json)
        credentials = service_account.Credentials.from_service_account_info(info)
        client = bigquery.Client(
            credentials=credentials,
            project=project or info.get("project_id"),
        )
    else:
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
