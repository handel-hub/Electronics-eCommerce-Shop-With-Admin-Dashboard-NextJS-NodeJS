const express = require("express");
const router = express.Router();
const { getCategory, createCategory, updateCategory, deleteCategory, getAllCategories } = require("../controllers/category");
const { browseLimiter, adminLimiter } = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.route("/")
  .get(browseLimiter, getAllCategories)
  .post(adminLimiter, authenticate, requireAdmin, createCategory);

router.route("/:id")
  .get(browseLimiter, getCategory)
  .put(adminLimiter, authenticate, requireAdmin, updateCategory)
  .delete(adminLimiter, authenticate, requireAdmin, deleteCategory);

module.exports = router;