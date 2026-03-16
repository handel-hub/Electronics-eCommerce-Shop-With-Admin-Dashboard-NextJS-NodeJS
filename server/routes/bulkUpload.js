const express = require("express");
const router = express.Router();
const { uploadCsvAndCreateBatch, listBatches, getBatchDetail, updateBatchItems, deleteBatch } = require("../controllers/bulkUpload");
const { uploadLimiter, adminLimiter } = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.route("/")
  .get(adminLimiter, authenticate, requireAdmin, listBatches)
  .post(uploadLimiter, authenticate, requireAdmin, uploadCsvAndCreateBatch);

router.route("/:batchId")
  .get(adminLimiter, authenticate, requireAdmin, getBatchDetail)
  .put(adminLimiter, authenticate, requireAdmin, updateBatchItems)
  .delete(adminLimiter, authenticate, requireAdmin, deleteBatch);

module.exports = router;