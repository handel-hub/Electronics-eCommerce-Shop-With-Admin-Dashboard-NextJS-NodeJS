const express = require('express');
const router = express.Router();
const { initiatePayment, handleCallback, handleWebhook } = require('../controllers/payments');
const { orderLimiter } = require('../middleware/rateLimiter');

router.post('/initiate', orderLimiter, initiatePayment);
router.get('/callback', handleCallback);
router.post('/webhook', handleWebhook); // No rate limit — Paystack must always reach this
module.exports = router;