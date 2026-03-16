const express = require("express");
const router = express.Router();
const { getAllProducts, createProduct, updateProduct, deleteProduct, getProductById } = require("../controllers/products");
const { browseLimiter, adminLimiter } = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.route("/")
  .get(browseLimiter, getAllProducts)
  .post(adminLimiter, authenticate, requireAdmin, createProduct);

router.route("/:id")
  .get(browseLimiter, getProductById)
  .put(adminLimiter, authenticate, requireAdmin, updateProduct)
  .delete(adminLimiter, authenticate, requireAdmin, deleteProduct);

module.exports = router;
