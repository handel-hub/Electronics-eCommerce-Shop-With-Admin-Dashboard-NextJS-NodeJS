const express = require("express");
const router = express.Router();
const {
  getAllMerchants,
  getMerchantById,
  createMerchant,
  updateMerchant,
  deleteMerchant,
} = require("../controllers/merchant");
const { adminLimiter } = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');


// Get all merchants
router.get("/", adminLimiter,authenticate,requireAdmin, getAllMerchants);

// Get a specific merchant by ID
router.get("/:id", adminLimiter,authenticate,requireAdmin, getMerchantById);

// Create a new merchant
router.post("/", adminLimiter,authenticate,requireAdmin, createMerchant);

// Update a merchant
router.put("/:id", adminLimiter,authenticate,requireAdmin, updateMerchant);

// Delete a merchant
router.delete("/:id", adminLimiter,authenticate,requireAdmin, deleteMerchant);

module.exports = router;