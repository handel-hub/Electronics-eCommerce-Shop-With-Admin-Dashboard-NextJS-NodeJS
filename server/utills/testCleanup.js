const prisma = require('./db');
const { runCleanupJob } = require('../controllers/cleanupJob');

async function test() {
  // Create a merchant and category if needed
  const merchant = await prisma.merchant.findFirst();
  const category = await prisma.category.findFirst();
  const product = await prisma.product.findFirst();

  // Reserve some stock manually
  await prisma.product.update({
    where: { id: product.id },
    data: { inStockReserved: { increment: 2 } }
  });

  // Create an expired PENDING order
  const order = await prisma.customer_order.create({
    data: {
      name: 'Test', lastname: 'Cleanup',
      email: 'cleanup@test.com',
      phone: '08012345678',
      address: '123 Test St', apartment: 'Flat 1',
      city: 'Lagos', country: 'Nigeria', postalCode: '100001',
      company: '', total: 19999, totalKobo: 1999900,
      status: 'PENDING',
      paymentRef: `CLEANUP-TEST-${Date.now()}`,
      reservationExpiresAt: new Date(Date.now() - 60 * 1000), // 1 minute ago
      products: {
        create: [{
          productId: product.id,
          quantity: 2,
          priceAtPurchase: product.price
        }]
      }
    }
  });

  console.log('Created expired order:', order.id);
  console.log('inStockReserved before:', (await prisma.product.findUnique({ where: { id: product.id } })).inStockReserved);

  // Run cleanup
  await runCleanupJob();

  // Check results
  const updatedOrder = await prisma.customer_order.findUnique({ where: { id: order.id } });
  const updatedProduct = await prisma.product.findUnique({ where: { id: product.id } });
  const paymentEvent = await prisma.paymentEvent.findFirst({ where: { orderId: order.id } });

  console.log('\n📋 Results:');
  console.log('Order status:', updatedOrder.status, '(expected: EXPIRED)');
  console.log('inStockReserved after:', updatedProduct.inStockReserved, '(expected: 0)');
  console.log('PaymentEvent:', paymentEvent?.event, '(expected: EXPIRED)');

  await prisma.$disconnect();
}

test().catch(console.error);