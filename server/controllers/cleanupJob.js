const prisma = require('../utills/db');

const runCleanupJob = async () => {
    try {
        const expiredOrders = await prisma.customer_order.findMany({
            where: {
                status: 'PENDING',
                reservationExpiresAt: { lt: new Date() }
            },
            include: { products: true }
        });

        for (const order of expiredOrders) {
            // Atomic lock — prevents race with webhook
            const locked = await prisma.customer_order.updateMany({
                where: { id: order.id, status: 'PENDING' },
                data: { status: 'EXPIRED' }
            });

            if (locked.count === 0) continue; // Webhook beat us

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
                        event: 'EXPIRED'
                    }
                    });
            });
        }
    } catch (err) {
        console.error('Cleanup job error:', err);
    }
};

module.exports = { runCleanupJob };