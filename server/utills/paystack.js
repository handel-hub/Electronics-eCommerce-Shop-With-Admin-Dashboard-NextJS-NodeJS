const axios = require('axios');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
if (!PAYSTACK_SECRET_KEY) throw new Error('PAYSTACK_SECRET_KEY is not set');

const paystackClient = axios.create({
    baseURL: 'https://api.paystack.co',
    headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
    },
});

/**
 * Initialize a Paystack transaction
 * @param {string} email - customer email
 * @param {number} amountKobo - amount in kobo
 * @param {string} reference - unique order reference
 * @param {object} metadata - additional data
 */
const initializeTransaction = async (email, amountKobo, reference, metadata = {}) => {
    const response = await paystackClient.post('/transaction/initialize', {
        email,
        amount: amountKobo,
        reference,
        metadata,
        currency: 'NGN',
    });
  return response.data.data; // { authorization_url, access_code, reference }
};

/**
 * Verify a Paystack transaction
 * @param {string} reference - Paystack reference
 */
const verifyTransaction = async (reference) => {
    const response = await paystackClient.get(`/transaction/verify/${reference}`);
    return response.data.data; // { status, amount, reference, ... }
};

/**
 * Initiate a refund
 * @param {string} reference - Paystack reference
 * @param {number} amountKobo - amount to refund in kobo
 */
const initiateRefund = async (reference, amountKobo) => {
    const response = await paystackClient.post('/refund', {
        transaction: reference,
        amount: amountKobo,
    });
    return response.data.data;
};

/**
 * Verify webhook signature
 * @param {string} payload - raw request body as string
 * @param {string} signature - x-paystack-signature header
 */
const verifyWebhookSignature = (payload, signature) => {
    const crypto = require('crypto');
    const hash = crypto
        .createHmac('sha512', PAYSTACK_SECRET_KEY)
        .update(payload)
        .digest('hex');
    return hash === signature;
};

module.exports = {
    initializeTransaction,
    verifyTransaction,
    initiateRefund,
    verifyWebhookSignature,
};