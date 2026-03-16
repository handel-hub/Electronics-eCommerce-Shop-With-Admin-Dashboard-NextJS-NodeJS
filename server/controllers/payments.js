const prisma = require('../utills/db');
const { asyncHandler, AppError } = require('../utills/errorHandler');
const { validateOrderData } = require('../utills/validation');
const { initializeTransaction, verifyWebhookSignature } = require('../utills/paystack');
const { v4: uuidv4 } = require('uuid');

const initiatePayment = asyncHandler(async (request, response) => {
    if (!request.body || typeof request.body !== 'object') {
        throw new AppError('Invalid request body', 400);
    }

    const { items, idempotencyKey, ...orderData } = request.body;

    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
        throw new AppError('items must be a non-empty array', 400);
    }

    for (const item of items) {
        if (!item.productId || typeof item.productId !== 'string') {
        throw new AppError('Each item must have a valid productId', 400);
        }
        const qty = parseInt(item.quantity);
        if (!qty || qty <= 0) {
        throw new AppError('Each item must have a valid quantity greater than 0', 400);
        }
    }

    // Validate order data
    const validation = validateOrderData(orderData, { requireTotal: false, requireStatus: false });
    if (!validation.isValid) {
        return response.status(400).json({
        error: 'Validation failed',
        details: validation.errors
        });
    }

    const validatedData = validation.validatedData;

    // Idempotency check
    if (idempotencyKey) {
        const existing = await prisma.customer_order.findUnique({
        where: { idempotencyKey }
        });
        if (existing) {
        if (existing.status === 'PAID') {
            return response.status(409).json({ error: 'Order already paid' });
        }
        if (existing.status === 'PENDING') {
            // Return existing payment URL — customer is retrying
            return response.status(200).json({
            paymentUrl: `https://checkout.paystack.com/${existing.paymentRef}`,
            orderId: existing.id,
            paymentRef: existing.paymentRef
            });
        }
        }
    }

    // Fetch and validate all products
    const productIds = items.map(i => i.productId);
    const products = await prisma.product.findMany({
        where: { id: { in: productIds } }
    });
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//partial product rejection
    if (products.length !== productIds.length) {
        throw new AppError('One or more products not found', 404);
    }

    // Check stock for each item atomically
    for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        const available = product.inStock - product.inStockReserved;
        if (available < parseInt(item.quantity)) {
        throw new AppError(
            `Insufficient stock for "${product.title}". Requested: ${item.quantity}, Available: ${available}`,
            400
        );
        }
    }

    // Calculate total server-side
    const total = items.reduce((sum, item) => {
        const product = products.find(p => p.id === item.productId);
        return sum + (parseFloat(product.price.toString()) * parseInt(item.quantity));
        
    }, 0);

    const totalRounded = Math.round(total * 100) / 100; // naira, 2dp
    const totalKobo = Math.round(total * 100);           // kobo, integer


    const paymentRef = `ORD-${uuidv4()}`;
    const reservationExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Atomic transaction — reserve stock + create order
    const order = await prisma.$transaction(async (tx) => {
        // Re-check stock inside transaction to prevent race condition
        for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        const available = product.inStock - product.inStockReserved;
        if (available < parseInt(item.quantity)) {
            throw new AppError(
            `Insufficient stock for "${product.title}". Requested: ${item.quantity}, Available: ${available}`,
            400
            );}
        }

        // Create order
        const newOrder = await tx.customer_order.create({
            data: {
                name: validatedData.name,
                lastname: validatedData.lastname,
                phone: validatedData.phone,
                email: validatedData.email,
                company: validatedData.company ?? '',
                address: validatedData.address,
                apartment: validatedData.apartment,
                postalCode: validatedData.postalCode,
                status: 'PENDING',
                city: validatedData.city,
                country: validatedData.country,
                orderNotice: validatedData.orderNotice,
                total: totalRounded,
                totalKobo,
                paymentRef,
                idempotencyKey: idempotencyKey ?? null,
                reservationExpiresAt,
                dateTime: new Date()
            }
        });

        // Create order products with locked prices
        for (const item of items) {
            const product = products.find(p => p.id === item.productId);
            await tx.customer_order_product.create({
                data: {
                customerOrderId: newOrder.id,
                productId: item.productId,
                quantity: parseInt(item.quantity),
                priceAtPurchase: product.price
                }
            });

            // Reserve stock
            await tx.product.update({
                where: { id: item.productId },
                data: { inStockReserved: { increment: parseInt(item.quantity) } }
            });
        }

        // Log payment event
        await tx.paymentEvent.create({
            data: {
                orderId: newOrder.id,
                event: 'INITIATED',
                amount: totalKobo,
                paymentRef
            }
        });

        return newOrder;
    });

    // Initialize Paystack transaction
    const paystackData = await initializeTransaction(
        validatedData.email,
        totalKobo,
        paymentRef,
        { orderId: order.id }
    );

    return response.status(201).json({
        paymentUrl: paystackData.authorization_url,
        orderId: order.id,
        paymentRef,
        total: totalRounded
    });
    });

    const handleCallback = asyncHandler(async (request, response) => {
    // Callback is unreliable — just acknowledge and tell customer to wait
    // Actual fulfillment happens in webhook processor
    const { reference } = request.query;

    if (!reference) {
        return response.status(400).json({ error: 'Missing reference' });
    }

    const order = await prisma.customer_order.findUnique({
        where: { paymentRef: reference }
    });

    if (!order) {
        return response.status(404).json({ error: 'Order not found' });
    }

    return response.status(200).json({
        message: 'Payment received. Your order is being confirmed.',
        orderId: order.id,
        status: order.status
    });
});

const handleWebhook = asyncHandler(async (request, response) => {
    const signature = request.headers['x-paystack-signature'];

    if (!signature) {
        return response.status(400).json({ error: 'Missing signature' });
    }

    // Verify signature using raw body
    const rawBody = JSON.stringify(request.body);
    const isValid = verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
        console.error('Invalid Paystack webhook signature');
        return response.status(400).json({ error: 'Invalid signature' });
    }

    const { event, data } = request.body;
    const paymentRef = data?.reference;

    if (!paymentRef) {
        return response.status(200).json({ received: true }); // Ignore events without reference
    }

  // Persist webhook event for async processing — upsert prevents duplicate storage
    try {
        await prisma.webhookEvent.upsert({
        where: {
            paymentRef_eventType: {
            paymentRef,
            eventType: event
            }
        },
        update: {
            // If already exists, just update status back to UNPROCESSED if it failed
            status: 'UNPROCESSED'
        },
        create: {
            paymentRef,
            eventType: event,
            payload: request.body,
            status: 'UNPROCESSED'
        }
    });
    } catch (err) {
        console.error('Failed to persist webhook event:', err);
        // Still return 200 — we don't want Paystack to retry
    }

    // Always return 200 to Paystack immediately
    return response.status(200).json({ received: true });     
});

module.exports = {
    initiatePayment,
    handleCallback,
    handleWebhook
};