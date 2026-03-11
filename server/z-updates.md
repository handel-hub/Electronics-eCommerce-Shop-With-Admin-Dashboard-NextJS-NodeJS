# UPDATING

- bulk update using csv --- duplicate bulk upload controller and service -then refactor

# Future Optimizations (when needed)
- DB indexing THEN QUERY OPTIMIZATIONS
- Add indexes to bulk_upload_item (batchId, status)
- Add indexes to Product (categoryId)
- Replace getBatchSummary with groupBy
- Add indexes to Customer_order (status, email)

## Category Enhancements

- Add product count to getAllCategories response for admin panel display
  ("Tops (12)" instead of just "Tops"). Use Prisma _count:
  include: { _count: { select: { products: true } } }
  Useful for frontend filtering and admin knowing which categories are
  empty before deleting them. Not urgent — UI customization phase.

## Code Style & Consistency

- Refactor customer_orders.js to use asyncHandler + AppError for consistency
  with rest of codebase. Note: notification try/catch blocks MUST remain
  separate — notification failure should never fail the order response.
  Touch errorHandler.js to handle P2002 and P2025 centrally if refactoring.


## Merchant — Marketplace Upgrade Path

Currently single store mode:
  - STORE_MERCHANT_ID in .env points to seeded merchant
  - merchantId silently applied in createProduct + bulkUpload
  - only GET and PUT routes exposed

To enable marketplace:
  1. Restore createMerchant, deleteMerchant routes
  2. Add merchantId field to product creation form
  3. Add merchant selection to bulk upload CSV
  4. Add merchant dashboard with own product views
  5. Update auth to associate users with merchants