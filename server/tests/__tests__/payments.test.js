const request = require('supertest');
const app = require('../../app');
const prisma = require('../../utills/db');
const jwt = require('jsonwebtoken');

// ─── Mock Paystack ───────────────────────────────────────────────────────────

jest.mock('../../utills/paystack', () => ({
  initializeTransaction: jest.fn(),
  verifyTransaction: jest.fn(),
  verifyWebhookSignature: jest.fn(),
  initiateRefund: jest.fn(),
}));

const {
  initializeTransaction,
  verifyWebhookSignature,
} = require('../../utills/paystack');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAdminToken() {
  return jwt.sign(
    { id: 'admin-id-001', role: 'admin', iat: Math.floor(Date.now() / 1000) },
    process.env.NEXTAUTH_SECRET,
    { expiresIn: '15m' }
  );
}

// ─── Seed Data ───────────────────────────────────────────────────────────────

let testCategoryId;
let testMerchantId;
let testProductId;
let testProductId2;

beforeAll(async () => {
  testMerchantId = process.env.STORE_MERCHANT_ID;

  const category = await prisma.category.upsert({
    where: { name: 'jest-payments-category' },
    update: {},
    create: { name: 'jest-payments-category' }
  });
  testCategoryId = category.id;

  const product1 = await prisma.product.upsert({
    where: { slug: 'jest-payment-product-1' },
    update: { inStock: 10, inStockReserved: 0 },
    create: {
      title: 'Jest Payment Product 1',
      slug: 'jest-payment-product-1',
      price: 29.99,
      rating: 5,
      description: 'Test product 1',
      manufacturer: 'Jest',
      mainImage: 'test.webp',
      inStock: 10,
      inStockReserved: 0,
      category: { connect: { id: testCategoryId } },
      merchant: { connect: { id: testMerchantId } },
    }
  });
  testProductId = product1.id;

  const product2 = await prisma.product.upsert({
    where: { slug: 'jest-payment-product-2' },
    update: { inStock: 2, inStockReserved: 0 },
    create: {
      title: 'Jest Payment Product 2',
      slug: 'jest-payment-product-2',
      price: 49.99,
      rating: 5,
      description: 'Test product 2',
      manufacturer: 'Jest',
      mainImage: 'test.webp',
      inStock: 2,
      inStockReserved: 0,
      category: { connect: { id: testCategoryId } },
      merchant: { connect: { id: testMerchantId } },
    }
  });
  testProductId2 = product2.id;
});

afterAll(async () => {
  await prisma.paymentEvent.deleteMany({
    where: { order: { products: { some: { product: { slug: { contains: 'jest-payment' } } } } } }
  });
  await prisma.webhookEvent.deleteMany({
    where: { paymentRef: { contains: 'JEST' } }
  });
  await prisma.customer_order_product.deleteMany({
    where: { product: { slug: { contains: 'jest-payment' } } }
  });
  await prisma.customer_order.deleteMany({
    where: { email: { contains: 'jest' } }
  });
  await prisma.product.deleteMany({ where: { slug: { contains: 'jest-payment' } } });
  await prisma.category.deleteMany({ where: { name: { contains: 'jest-payments' } } });
  await prisma.$disconnect();
});

// ─── Valid request body ───────────────────────────────────────────────────────

const validInitiateBody = () => ({
  name: 'John',
  lastname: 'Doe',
  email: 'jest-pay@test.com',
  phone: '08012345678',
  address: '123 Main Street',
  apartment: 'Flat 2',
  city: 'Lagos',
  country: 'Nigeria',
  postalCode: '100001',
  company: '',
  orderNotice: '',
  status: 'PENDING',
  idempotencyKey: `jest-idem-${Date.now()}`,
  items: [
    { productId: null, quantity: 2 }, // productId filled in tests
  ]
});

// ─── POST /api/payments/initiate ─────────────────────────────────────────────

describe('POST /api/payments/initiate', () => {
  beforeEach(() => {
    initializeTransaction.mockResolvedValue({
      authorization_url: 'https://checkout.paystack.com/test123',
      access_code: 'test123',
      reference: 'ORD-test-ref'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when items missing', async () => {
    const { items, ...body } = validInitiateBody();
    const res = await request(app).post('/api/payments/initiate').send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when items is empty array', async () => {
    const body = { ...validInitiateBody(), items: [] };
    const res = await request(app).post('/api/payments/initiate').send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when name missing', async () => {
    const body = validInitiateBody();
    body.items = [{ productId: testProductId, quantity: 1 }];
    delete body.name;
    const res = await request(app).post('/api/payments/initiate').send(body);
    expect(res.status).toBe(400);
  });

  it('returns 404 when product not found', async () => {
    const body = {
      ...validInitiateBody(),
      idempotencyKey: `jest-idem-404-${Date.now()}`,
      items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }]
    };
    const res = await request(app).post('/api/payments/initiate').send(body);
    expect(res.status).toBe(404);
  });

  it('returns 400 when insufficient stock', async () => {
    const body = {
      ...validInitiateBody(),
      idempotencyKey: `jest-idem-stock-${Date.now()}`,
      items: [{ productId: testProductId2, quantity: 99 }]
    };
    const res = await request(app).post('/api/payments/initiate').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/stock/i);
  });

  it('returns 201 with paymentUrl on valid request', async () => {
    const body = {
      ...validInitiateBody(),
      idempotencyKey: `jest-idem-success-${Date.now()}`,
      items: [{ productId: testProductId, quantity: 2 }]
    };
    const res = await request(app).post('/api/payments/initiate').send(body);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('paymentUrl');
    expect(res.body).toHaveProperty('orderId');
    expect(res.body).toHaveProperty('paymentRef');
    expect(res.body).toHaveProperty('total');
    expect(initializeTransaction).toHaveBeenCalledTimes(1);
  });

  it('reserves stock after successful initiate', async () => {
    const before = await prisma.product.findUnique({ where: { id: testProductId } });

    const body = {
      ...validInitiateBody(),
      idempotencyKey: `jest-idem-reserve-${Date.now()}`,
      items: [{ productId: testProductId, quantity: 1 }]
    };
    await request(app).post('/api/payments/initiate').send(body);

    const after = await prisma.product.findUnique({ where: { id: testProductId } });
    expect(after.inStockReserved).toBe(before.inStockReserved + 1);
  });

  it('returns 409 when idempotencyKey matches PAID order', async () => {
    const paidKey = `jest-idem-paid-${Date.now()}`;
    await prisma.customer_order.create({
      data: {
        name: 'John', lastname: 'Doe', email: 'jest-paid@test.com',
        phone: '08012345678', address: '123 St', apartment: 'Flat 1',
        city: 'Lagos', country: 'Nigeria', postalCode: '100001',
        company: '', total: 59.99, totalKobo: 5999,
        status: 'PAID', paymentRef: `JEST-PAID-${Date.now()}`,
        idempotencyKey: paidKey
      }
    });

    const body = {
      ...validInitiateBody(),
      idempotencyKey: paidKey,
      items: [{ productId: testProductId, quantity: 1 }]
    };
    const res = await request(app).post('/api/payments/initiate').send(body);
    expect(res.status).toBe(409);
  });

  it('returns 200 with existing paymentUrl when idempotencyKey matches PENDING order', async () => {
    const pendingKey = `jest-idem-pending-${Date.now()}`;
    const ref = `JEST-PENDING-${Date.now()}`;
    await prisma.customer_order.create({
      data: {
        name: 'John', lastname: 'Doe', email: 'jest-pending@test.com',
        phone: '08012345678', address: '123 St', apartment: 'Flat 1',
        city: 'Lagos', country: 'Nigeria', postalCode: '100001',
        company: '', total: 59.99, totalKobo: 5999,
        status: 'PENDING', paymentRef: ref,
        idempotencyKey: pendingKey,
        reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
      }
    });

    const body = {
      ...validInitiateBody(),
      idempotencyKey: pendingKey,
      items: [{ productId: testProductId, quantity: 1 }]
    };
    const res = await request(app).post('/api/payments/initiate').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('paymentUrl');
    expect(initializeTransaction).not.toHaveBeenCalled();
  });
});

// ─── GET /api/payments/callback ───────────────────────────────────────────────

describe('GET /api/payments/callback', () => {
  let callbackOrderRef;

  beforeAll(async () => {
    callbackOrderRef = `JEST-CALLBACK-${Date.now()}`;
    await prisma.customer_order.create({
      data: {
        name: 'John', lastname: 'Doe', email: 'jest-callback@test.com',
        phone: '08012345678', address: '123 St', apartment: 'Flat 1',
        city: 'Lagos', country: 'Nigeria', postalCode: '100001',
        company: '', total: 59.99, totalKobo: 5999,
        status: 'PENDING', paymentRef: callbackOrderRef,
        reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
      }
    });
  });

  it('returns 400 when reference missing', async () => {
    const res = await request(app).get('/api/payments/callback');
    expect(res.status).toBe(400);
  });

  it('returns 404 when order not found', async () => {
    const res = await request(app).get('/api/payments/callback?reference=NONEXISTENT-REF');
    expect(res.status).toBe(404);
  });

  it('returns 200 with order status', async () => {
    const res = await request(app).get(`/api/payments/callback?reference=${callbackOrderRef}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('orderId');
    expect(res.body).toHaveProperty('status');
  });
});

// ─── POST /api/payments/webhook ───────────────────────────────────────────────

describe('POST /api/payments/webhook', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when signature missing', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ event: 'charge.success', data: { reference: 'REF-001' } });
    expect(res.status).toBe(400);
  });

  it('returns 400 when signature invalid', async () => {
    verifyWebhookSignature.mockReturnValue(false);
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('x-paystack-signature', 'invalid-sig')
      .send({ event: 'charge.success', data: { reference: 'REF-001' } });
    expect(res.status).toBe(400);
  });

  it('returns 200 and persists webhook event when signature valid', async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const ref = `JEST-WEBHOOK-${Date.now()}`;
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('x-paystack-signature', 'valid-sig')
      .send({ event: 'charge.success', data: { reference: ref } });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('received', true);

    // Verify event was persisted
    const event = await prisma.webhookEvent.findFirst({
      where: { paymentRef: ref }
    });
    expect(event).not.toBeNull();
    expect(event.status).toBe('UNPROCESSED');
  });

  it('returns 200 on duplicate webhook — upsert prevents duplicate rows', async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const ref = `JEST-WEBHOOK-DUP-${Date.now()}`;
    const payload = { event: 'charge.success', data: { reference: ref } };

    await request(app)
      .post('/api/payments/webhook')
      .set('x-paystack-signature', 'valid-sig')
      .send(payload);

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('x-paystack-signature', 'valid-sig')
      .send(payload);

    expect(res.status).toBe(200);

    const events = await prisma.webhookEvent.findMany({
      where: { paymentRef: ref }
    });
    expect(events.length).toBe(1); // Only one row despite two requests
  });

  it('returns 200 when no reference in payload', async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('x-paystack-signature', 'valid-sig')
      .send({ event: 'charge.success', data: {} });
    expect(res.status).toBe(200);
  });
});