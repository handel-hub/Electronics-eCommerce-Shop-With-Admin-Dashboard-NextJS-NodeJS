const express = require('express');
const router = express.Router();
const { getCustomerOrder, createCustomerOrder, updateCustomerOrder, deleteCustomerOrder, getAllOrders } = require('../controllers/customer_orders');
const { orderLimiter, adminLimiter } = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.route('/')
  .get(adminLimiter, authenticate, requireAdmin, getAllOrders)
  .post(orderLimiter, createCustomerOrder);                    // public — customer checkout

router.route('/:id')
  .get(adminLimiter, authenticate, requireAdmin, getCustomerOrder)
  .put(adminLimiter, authenticate, requireAdmin, updateCustomerOrder)
  .delete(adminLimiter, authenticate, requireAdmin, deleteCustomerOrder);

module.exports = router;