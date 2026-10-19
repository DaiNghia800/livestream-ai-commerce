# Commerce route authorization

Shop routes authenticate a Bearer access token, require the `shop_owner`
role, and resolve the caller's shop from the shared auth repository using
the token's user ID. Client-provided `X-Shop-Id`, `X-Merchant-Id`, and
`X-User-Id` headers are not used to establish identity.

| Route | Access | Ownership boundary |
|---|---|---|
| `GET /api/products/categories` | Public | Category catalog |
| `POST /api/products/categories` | Shop owner | Category creation |
| `GET /api/products`, `/export.xlsx` | Shop owner | Resolved `shop_id` |
| `POST /api/products`, `/import.xlsx` | Shop owner | Resolved `shop_id` |
| `GET/PATCH/DELETE /api/products/:id` | Shop owner | Product's `shop_id`; a foreign product is 404 |
| `GET /api/products/:id/history` | Shop owner | Product's `shop_id` |
| `POST /api/products/:id/skus` | Shop owner | Parent product's `shop_id` |
| `PATCH/DELETE /api/products/:id/skus/:skuId` | Shop owner | SKU's parent product's `shop_id` |
| `POST /api/products/:id/images` | Shop owner | Parent product's `shop_id` |
| `PATCH/DELETE /api/products/:id/images/:imageId` | Shop owner | Image's parent product's `shop_id` |
| `GET /api/inventory`, `/summary`, `/export.xlsx` | Shop owner | Inventory joined through SKU/product `shop_id` |
| `GET /api/inventory/adjustments`, `/adjustments/export.xlsx` | Shop owner | Adjustment history joined through the owning product |
| `GET/PUT /api/inventory/adjustments/documents/draft` | Shop owner | Document and referenced product belong to resolved shop |
| `POST /api/inventory/adjustments/batch` | Shop owner | Every SKU and optional document belongs to resolved shop |
| `GET /api/inventory/skus/:skuId` | Shop owner | SKU's parent product `shop_id` |
| `POST /api/inventory/skus/:skuId/adjust`, `/reserve`, `/release`, `/consume` | Shop owner | SKU's parent product `shop_id` |
| `PATCH /api/inventory/skus/:skuId/threshold` | Shop owner | SKU's parent product `shop_id` |
| `POST /api/livestreams`, `GET /api/livestreams` | Shop owner | Resolved `merchant_id` |
| `GET /api/livestreams/:id` | Public | Public projection only; internal merchant/IVS fields are excluded |
| `PATCH /api/livestreams/:id/status` | Shop owner | Livestream `merchant_id`; foreign livestream is 404 |
| `GET /api/livestreams/:id/stream-config` | Shop owner | Livestream `merchant_id`; foreign livestream is 404 |
| `GET /api/livestreams/:id/products` | Public | Public product projection |
| `POST/PATCH/DELETE /api/livestreams/:id/products[/:productId]` | Shop owner | Livestream `merchant_id`; product must belong to the same merchant |
| `POST /api/uploads/livestream-cover/presign` | Shop owner | Object key scoped to resolved shop |
| `POST /api/uploads/product-image/presign` | Shop owner | Object key scoped to resolved shop |
| `PUT /api/uploads/product-image/:fileName` | Shop owner | Pending upload must be owned by resolved shop |

Missing or invalid access tokens return `401`; authenticated users without the
shop-owner role or without an associated shop return `403`. A resource outside
the caller's shop returns `404` without being modified.

The livestream router currently does not define comments, chat-config, or
chat-token routes. No authentication or chat-token behavior is claimed for
those routes in this document.
