const prisma = require('../utills/db');
const { verifyTransaction, initiateRefund } = require('../utills/paystack');

const processWebhookEvent = async (event) => {
    const { eventType, payload, id } = event;
    const data = payload?.data;
    const paymentRef = data?.reference;

    if (!paymentRef) {
        throw new Error('No reference in webhook payload');
    }

    if (eventType === 'charge.success') {
        // Verify transaction independently with Paystack
        const paystackData = await verifyTransaction(paymentRef);

        if (paystackData.status !== 'success') {
            throw new Error(`Transaction not successful: ${paystackData.status}`);
        }

        // Find the order
        const order = await prisma.customer_order.findUnique({
            where: { paymentRef },
            include: { products: true }
        });

        if (!order) {
            throw new Error(`Order not found for reference: ${paymentRef}`);
        }

    // Verify amount matches
        if (paystackData.amount !== order.totalKobo) {
            console.error(`Amount mismatch for ${paymentRef}: expected ${order.totalKobo}, got ${paystackData.amount}`);
            // Trigger refund
            await prisma.refundAttempt.create({
                data: {
                    orderId: order.id,
                    amountKobo: paystackData.amount,
                    reason: `Amount mismatch: expected ${order.totalKobo} kobo, received ${paystackData.amount} kobo`,
                    status: 'PENDING'
                }
            });
            await prisma.paymentEvent.create({
                data: {
                    orderId: order.id,
                    event: 'REFUND_INITIATED',
                    amount: paystackData.amount,
                    paymentRef
                }
            });
            return;
        }

    // Handle EXPIRED order — customer paid after expiry
    // should still process even after expired if still instock after release continue transaction but if not instock return
        if (order.status === 'EXPIRED') {
            await prisma.refundAttempt.create({
                data: {
                    orderId: order.id,
                    amountKobo: paystackData.amount,
                    reason: 'Payment received after order expiry',
                    status: 'PENDING'
                }
            });
            await prisma.paymentEvent.create({
                data: {
                    orderId: order.id,
                    event: 'REFUND_INITIATED',
                    amount: paystackData.amount,
                    paymentRef
                }
            });
                return;
        }

    // Atomic idempotent fulfillment lock
        const locked = await prisma.customer_order.updateMany({
            where: { paymentRef, status: 'PENDING' },
            data: { status: 'PAID' }
        });

        if (locked.count === 0) {
        // Already processed by another webhook — exit cleanly
            return;
        }

    // Decrement stock
        await prisma.$transaction(async (tx) => {
            for (const item of order.products) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: {
                        inStock: { decrement: item.quantity },
                        inStockReserved: { decrement: item.quantity }
                    }
                });
        }

        await tx.paymentEvent.create({
            data: {
                orderId: order.id,
                event: 'PAYMENT_SUCCESS',
                amount: paystackData.amount,
                paymentRef,
                payload: paystackData
            }
        });
    });

    } else if (eventType === 'charge.failed') {
        const order = await prisma.customer_order.findUnique({
            where: { paymentRef },
            include: { products: true }
        });

        if (!order) return;

        const locked = await prisma.customer_order.updateMany({
            where: { paymentRef, status: 'PENDING' },
            data: { status: 'FAILED' }
        });

        if (locked.count === 0) return;

        // Release reservations
        await prisma.$transaction(async (tx) => {
            for (const item of order.products) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: { inStockReserved: { decrement: item.quantity } }
                });
            }

            await tx.paymentEvent.create({
                data: {
                    orderId: order.id,
                    event: 'PAYMENT_FAILED',
                    paymentRef
                }
            });
        });

    } else if (eventType === 'refund.processed') {
        const refundAttempt = await prisma.refundAttempt.findFirst({
            where: { order: { paymentRef } }
            });

        if (refundAttempt) {
            await prisma.refundAttempt.update({
                where: { id: refundAttempt.id },
                data: { status: 'SUCCESS', resolvedAt: new Date() }
            });
        }

        const order = await prisma.customer_order.findUnique({
            where: { paymentRef }
        });

        if (order) {
        await prisma.paymentEvent.create({
            data: {
                orderId: order.id,
                event: 'REFUND_SUCCESS',
                paymentRef
            }
        });
        }
    }
};

const runWebhookProcessor = async () => {
    try {
        const events = await prisma.webhookEvent.findMany({
            where: {
                OR: [
                { status: 'UNPROCESSED' },
                {
                    status: 'FAILED',
                    attempts: { lt: 5 },
                    lastAttempt: { lt: new Date(Date.now() - 5 * 60 * 1000) } // 5 min backoff
                }
                ]
            },
            orderBy: { createdAt: 'asc' },
            take: 50 // Process in batches
        });

        for (const event of events) {
        // Acquire processing lock
            const locked = await prisma.webhookEvent.updateMany({
                where: { id: event.id, status: { not: 'PROCESSING' } },
                data: { status: 'PROCESSING' }
            });

            if (locked.count === 0) continue; // Another instance grabbed it

        try {
            await processWebhookEvent(event);

            await prisma.webhookEvent.update({
                where: { id: event.id },
                data: { status: 'PROCESSED', processedAt: new Date() }
                });

        } catch (err) {
            const newAttempts = event.attempts + 1;
            await prisma.webhookEvent.update({
                where: { id: event.id },
                data: {
                    status: newAttempts >= 5 ? 'DEAD' : 'FAILED',
                    attempts: newAttempts,
                    lastAttempt: new Date(),
                    error: err.message
                }
            });

            if (newAttempts >= 5) {
                console.error(`Webhook event ${event.id} is DEAD after 5 attempts:`, err.message);
            }
        }
        }
    } catch (err) {
        console.error('Webhook processor error:', err);
    }
};

module.exports = { runWebhookProcessor };