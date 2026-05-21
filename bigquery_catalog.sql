SELECT
  aggregated_item.objectid,
  aggregated_item.first_photo AS image_url,
  CONCAT('https://www.sellpy.se/item/', aggregated_item.objectid) AS product_url,
  aggregated_item.category_lvl_0 AS category,
  aggregated_item.category_lvl_1 AS category_1,
  aggregated_item.brand,
  aggregated_item.demography,
  aggregated_item.size,
  aggregated_item.last_price_sek AS price,
  aggregated_item.createdat
FROM dw_tables.aggregated_item AS aggregated_item
WHERE aggregated_item.itemstatus = 'utlagd'
  AND aggregated_item.first_photo IS NOT NULL
ORDER BY aggregated_item.createdat DESC
LIMIT 10000
