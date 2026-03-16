const request = require('supertest');
const app = require('../../app');
const prisma = require('../../utills/db');
const jwt = require('jsonwebtoken');

function makeAdminToken() {
  return jwt.sign(
    { id: 'admin-id-001', role: 'admin', iat: Math.floor(Date.now() / 1000) },
    process.env.NEXTAUTH_SECRET,
    { expiresIn: '15m' }
  );
}

const VALID_ORDER = {
  name: 'John',
  lastname: 'Doe',
  email: 'john@jest-test.com',
  phone: '1234567890',
  company: '',
  address: '123 Test Street',
  apartment: '1A',
  city: 'Lagos',
  country: 'Nigeria',
  postalCode: '100001',
  total: 59.99,
  status: 'PENDING',
  orderNotice: '',
};

let testOrderId;
let testProductId;
let testCategoryId;
let testMerchantId;

beforeAll(async () => {
  testMerchantId = process.env.STORE_MERCHANT_ID;

  const category = await prisma.category.upsert({
    where: { name: 'jest-orders-category' },
    update: {},
    create: { name: 'jest-orders-category' }
  });
  testCategoryId = category.id;

  const product = await prisma.product.upsert({
    where: { slug: 'jest-order-product' },
    update: {},
    create: {
      title: 'Jest Order Product',
      slug: 'jest-order-product',
      price: 29.99,
      rating: 5,
      description: 'Test',
      manufacturer: 'Test',
      mainImage: 'test.webp',
      inStock: 10,
      category: { connect: { id: testCategoryId } },   // ← connect not id
      merchant: { connect: { id: testMerchantId } },   // ← connect not id
    }
  });
  testProductId = product.id;

  // Create order directly via Prisma with company as string
  const order = await prisma.customer_order.create({
    data: {
      name: 'John',
      lastname: 'Doe',
      email: 'jest-seed-order@test.com',
      phone: '1234567890',
      company: '',
      address: '123 Test St',
      apartment: '1A',
      city: 'Lagos',
      country: 'Nigeria',
      postalCode: '100001',
      total: 59,
      totalKobo: 5900,
      status: 'PENDING',
      orderNotice: '',
    }
  });
  testOrderId = order.id;
});

afterAll(async () => {
  await prisma.customer_order_product.deleteMany({ where: { customerOrderId: testOrderId } });
  await prisma.customer_order.deleteMany({ where: { email: { contains: 'jest' } } });
  await prisma.product.deleteMany({ where: { slug: { contains: 'jest-order' } } });
  await prisma.category.deleteMany({ where: { name: { contains: 'jest-orders' } } });
  await prisma.$disconnect();
});

// ─── POST /api/orders ────────────────────────────────────────────────────────

describe('POST /api/orders', () => {
  it('returns 400 when name missing', async () => {
    const { name, ...body } = VALID_ORDER;
    const res = await request(app).post('/api/orders').send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ ...VALID_ORDER, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for XSS in name', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ ...VALID_ORDER, name: '<script>alert(1)</script>' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for XSS in orderNotice', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ ...VALID_ORDER, orderNotice: '<script>steal(cookies)</script>' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ ...VALID_ORDER, status: 'INVALID_STATUS' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative total', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ ...VALID_ORDER, total: -10 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for zero total', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ ...VALID_ORDER, total: 0 });
    expect(res.status).toBe(400);
  });

  it('creates order successfully with valid data', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ ...VALID_ORDER, email: 'jest-new-order@test.com' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');

    await prisma.customer_order.delete({ where: { id: res.body.id } });
  });

  it('returns 409 on duplicate order — same email + total within 1 minute', async () => {
    // First order
    await request(app).post('/api/orders').send(VALID_ORDER);
    // Immediate duplicate
    const res = await request(app).post('/api/orders').send(VALID_ORDER);
    expect(res.status).toBe(409);

    // Cleanup
    await prisma.customer_order.deleteMany({ where: { email: VALID_ORDER.email } });
  });
});

// ─── GET /api/orders ─────────────────────────────────────────────────────────

describe('GET /api/orders', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });

  it('returns 200 with admin token', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/orders/:id ─────────────────────────────────────────────────────

describe('GET /api/orders/:id', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app).get(`/api/orders/${testOrderId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent order', async () => {
    const res = await request(app)
      .get('/api/orders/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('returns order by id', async () => {
    const res = await request(app)
      .get(`/api/orders/${testOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', testOrderId);
  });
});

// ─── PUT /api/orders/:id ─────────────────────────────────────────────────────

describe('PUT /api/orders/:id', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .put(`/api/orders/${testOrderId}`)
      .send({ status: 'PROCESSING' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent order', async () => {
    const res = await request(app)
      .put('/api/orders/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PROCESSING' });
    expect(res.status).toBe(404);
  });

  it('updates order status successfully', async () => {
    const res = await request(app)
      .put(`/api/orders/${testOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PROCESSING' });
    expect(res.status).toBe(200);
  });
});

// ─── DELETE /api/orders/:id ──────────────────────────────────────────────────

describe('DELETE /api/orders/:id', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app).delete(`/api/orders/${testOrderId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent order', async () => {
    const res = await request(app)
      .delete('/api/orders/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/order-product ─────────────────────────────────────────────────

describe('POST /api/order-product', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post('/api/order-product')
      .send({ customerOrderId: testOrderId, productId: testProductId, quantity: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 400 when customerOrderId missing', async () => {
    const res = await request(app)
      .post('/api/order-product')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: testProductId, quantity: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when quantity is 0', async () => {
    const res = await request(app)
      .post('/api/order-product')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerOrderId: testOrderId, productId: testProductId, quantity: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent order', async () => {
    const res = await request(app)
      .post('/api/order-product')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerOrderId: '00000000-0000-0000-0000-000000000000',
        productId: testProductId,
        quantity: 1
      });
    expect(res.status).toBe(404);
  });

  it('creates order product successfully', async () => {
    const res = await request(app)
      .post('/api/order-product')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerOrderId: testOrderId, productId: testProductId, quantity: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });
});

// ─── GET /api/order-product ──────────────────────────────────────────────────

describe('GET /api/order-product', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/order-product');
    expect(res.status).toBe(401);
  });

  it('returns 200 with admin token', async () => {
    const res = await request(app)
      .get('/api/order-product')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

it('returns 400 when product is out of stock', async () => {
  // Set product inStock to 0
  await prisma.product.update({
    where: { id: testProductId },
    data: { inStock: 0 }
  });

  const res = await request(app)
    .post('/api/order-product')
    .set('Authorization', `Bearer ${makeAdminToken()}`)
    .send({ customerOrderId: testOrderId, productId: testProductId, quantity: 1 });
  expect(res.status).toBe(400);

  // Restore stock
  await prisma.product.update({
    where: { id: testProductId },
    data: { inStock: 10 }
  });
});

it('decrements stock after order product created', async () => {
  const before = await prisma.product.findUnique({ where: { id: testProductId } });

  await request(app)
    .post('/api/order-product')
    .set('Authorization', `Bearer ${makeAdminToken()}`)
    .send({ customerOrderId: testOrderId, productId: testProductId, quantity: 2 });

  const after = await prisma.product.findUnique({ where: { id: testProductId } });
  expect(after.inStock).toBe(before.inStock - 2);
});
// ─── GET /api/search ─────────────────────────────────────────────────────────

describe('GET /api/search', () => {
  it('returns 400 when query param missing', async () => {
    const res = await request(app).get('/api/search');
    expect(res.status).toBe(400);
  });

  it('returns 200 with results for valid query', async () => {
    const res = await request(app).get('/api/search?query=jest');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 200 with empty array for no matches', async () => {
    const res = await request(app).get('/api/search?query=xyznonexistent999');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('is case insensitive', async () => {
    const lower = await request(app).get('/api/search?query=jest');
    const upper = await request(app).get('/api/search?query=JEST');
    expect(lower.status).toBe(200);
    expect(upper.status).toBe(200);
    expect(lower.body.length).toBe(upper.body.length);
  });
});

// ─── GET /api/slugs/:slug ────────────────────────────────────────────────────

describe('GET /api/slugs/:slug', () => {
  it('returns 404 for non-existent slug', async () => {
    const res = await request(app).get('/api/slugs/this-slug-does-not-exist');
    expect(res.status).toBe(404);
  });

  it('returns product by valid slug', async () => {
    const res = await request(app).get('/api/slugs/jest-order-product');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('slug', 'jest-order-product');
  });

  it('includes category in response', async () => {
    const res = await request(app).get('/api/slugs/jest-order-product');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('category');
  });
});
