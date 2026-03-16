const express = require('express');
const router = express.Router();
const { createOrderProduct, updateProductOrder, deleteProductOrder, getProductOrder, getAllProductOrders } = require('../controllers/customer_order_product');
const { adminLimiter } = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.route('/')
    .get(adminLimiter, authenticate, requireAdmin, getAllProductOrders)
    .post(adminLimiter, authenticate, requireAdmin, createOrderProduct);

router.route('/:id')
    .get(adminLimiter, authenticate, requireAdmin, getProductOrder)
    .put(adminLimiter, authenticate, requireAdmin, updateProductOrder)
    .delete(adminLimiter, authenticate, requireAdmin, deleteProductOrder);

module.exports = router;