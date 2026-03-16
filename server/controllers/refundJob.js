const prisma = require('../utills/db');
const { initiateRefund } = require('../utills/paystack');

const runRefundJob = async () => {
    try {
        const pendingRefunds = await prisma.refundAttempt.findMany({
            where: {
                OR: [
                    { status: 'PENDING' },
                    {
                        status: 'FAILED',
                        attempts: { lt: 5 },
                        lastAttempt: { lt: new Date(Date.now() - 60 * 60 * 1000) } // 1 hour backoff
                    }
                ]
            },
            include: { order: true }
        });

        for (const refund of pendingRefunds) {
            try {
                await initiateRefund(refund.order.paymentRef, refund.amountKobo);

                await prisma.refundAttempt.update({
                    where: { id: refund.id },
                    data: {
                        status: 'SUCCESS',
                        resolvedAt: new Date()
                    }
                });

                await prisma.paymentEvent.create({
                    data: {
                        orderId: refund.orderId,
                        event: 'REFUND_SUCCESS',
                        amount: refund.amountKobo,
                        paymentRef: refund.order.paymentRef
                    }
                    });

                // Update order status to REFUNDED
                await prisma.customer_order.update({
                    where: { id: refund.orderId },
                    data: { status: 'REFUNDED' }
                });


            } catch (err) {
                const newAttempts = refund.attempts + 1;

                await prisma.refundAttempt.update({
                    where: { id: refund.id },
                    data: {
                        status: newAttempts >= 5 ? 'MANUAL_REVIEW' : 'FAILED',
                        attempts: newAttempts,
                        lastAttempt: new Date()
                    }
                });

                await prisma.paymentEvent.create({
                    data: {
                        orderId: refund.orderId,
                        event: 'REFUND_FAILED',
                        amount: refund.amountKobo,
                        paymentRef: refund.order.paymentRef
                    }
                });

                if (newAttempts >= 5) {
                    console.error(`Refund for order ${refund.orderId} needs MANUAL REVIEW after 5 attempts`);
                }
            }
        }
    } catch (err) {
        console.error('Refund job error:', err);
    }
};

module.exports = { runRefundJob };