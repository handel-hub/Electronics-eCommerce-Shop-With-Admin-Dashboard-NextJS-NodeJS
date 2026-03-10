# UPDATING

- bulk update using csv --- duplicate bulk upload controller and service -then refactor

# Future Optimizations (when needed)
- DB indexing THEN QUERY OPTIMIZATIONS
- Add indexes to bulk_upload_item (batchId, status)
- Add indexes to Product (categoryId)
- Replace getBatchSummary with groupBy
- Add indexes to Customer_order (status, email)
