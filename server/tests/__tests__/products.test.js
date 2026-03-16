const request = require('supertest');
const app = require('../../app');
const prisma = require('../../utills/db');
const jwt = require('jsonwebtoken');

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAdminToken(overrides = {}) {
  return jwt.sign(
    { id: 'admin-id-001', role: 'admin', iat: Math.floor(Date.now() / 1000), ...overrides },
    process.env.NEXTAUTH_SECRET,
    { expiresIn: '15m' }
  );
}

function makeUserToken(overrides = {}) {
  return jwt.sign(
    { id: 'user-id-001', role: 'user', iat: Math.floor(Date.now() / 1000), ...overrides },
    process.env.NEXTAUTH_SECRET,
    { expiresIn: '15m' }
  );
}

// ─── Seed Helpers ────────────────────────────────────────────────────────────

let testCategoryId;
let testProductId;
let testMerchantId;

// REPLACE the entire beforeAll in products.test.js:
beforeAll(async () => {
  const merchant = await prisma.merchant.upsert({
    where: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
    update: {},
    create: {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: 'Test Merchant',
    }
  });
  testMerchantId = merchant.id;
  process.env.STORE_MERCHANT_ID = testMerchantId;

  const category = await prisma.category.upsert({
    where: { name: 'test-category-jest' },
    update: {},
    create: { name: 'test-category-jest' }
  });
  testCategoryId = category.id;

  const product = await prisma.product.upsert({
    where: { slug: 'test-product-jest' },
    update: {},
    create: {
      title: 'Test Product',
      slug: 'test-product-jest',
      price: 29.99,
      rating: 5,
      description: 'Test description',
      manufacturer: 'Test Brand',
      mainImage: 'test.webp',
      inStock: 10,
      category: { connect: { id: testCategoryId } },
      merchant: { connect: { id: testMerchantId } },
    }
  });
  testProductId = product.id;
});
afterAll(async () => {
  // Clean up test data in correct order (FK constraints)
  await prisma.product.deleteMany({ where: { slug: { contains: 'jest' } } });
  await prisma.category.deleteMany({ where: { name: { contains: 'jest' } } });
  await prisma.merchant.deleteMany({ where: { id: 'test-merchant-001' } });
  await prisma.$disconnect();
});

// ─── GET /api/products ───────────────────────────────────────────────────────

describe('GET /api/products', () => {
  it('returns 200 with products array', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns products with category included', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('category');
    }
  });

  it('returns admin mode — no pagination', async () => {
    const res = await request(app).get('/api/products?mode=admin');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('handles page query param', async () => {
    const res = await request(app).get('/api/products?page=1');
    expect(res.status).toBe(200);
  });

  it('handles invalid page — defaults to 1', async () => {
    const res = await request(app).get('/api/products?page=-1');
    expect(res.status).toBe(200);
  });

  it('handles sort by price asc', async () => {
    const res = await request(app).get('/api/products?sort=lowPrice');
    expect(res.status).toBe(200);
  });

  it('handles sort by price desc', async () => {
    const res = await request(app).get('/api/products?sort=highPrice');
    expect(res.status).toBe(200);
  });

  it('handles sort by title asc', async () => {
    const res = await request(app).get('/api/products?sort=titleAsc');
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/products/:id ───────────────────────────────────────────────────

describe('GET /api/products/:id', () => {
  it('returns 200 with product by valid id', async () => {
    const res = await request(app).get(`/api/products/${testProductId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', testProductId);
  });

  it('returns 404 for non-existent product', async () => {
    const res = await request(app).get('/api/products/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/products ──────────────────────────────────────────────────────

describe('POST /api/products', () => {
  const adminToken = makeAdminToken();
  const userToken = makeUserToken();

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post('/api/products')
      .send({ title: 'Test', slug: 'test', price: 10, categoryId: 'x' });
    expect(res.status).toBe(401);
  });

  it('returns 403 with non-admin token', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'Test', slug: 'test', price: 10, categoryId: 'x' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when title missing', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: 'test', price: 10, categoryId: testCategoryId });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('title');
  });

  it('returns 400 when slug missing', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test', price: 10, categoryId: testCategoryId });
    expect(res.status).toBe(400);
  });

  it('returns 400 when price missing', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test', slug: 'test', categoryId: testCategoryId });
    expect(res.status).toBe(400);
  });

  it('returns 400 when categoryId missing', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test', slug: 'test', price: 10 });
    expect(res.status).toBe(400);
  });

  it('creates product successfully with valid data', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Jest Created Product',
        slug: 'jest-created-product',
        price: 49.99,
        description: 'Created in tests',
        manufacturer: 'Jest',
        mainImage: 'test.webp',
        categoryId: testCategoryId,
        inStock: 5,
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.merchantId).toBe(testMerchantId);

    // Cleanup
    await prisma.product.delete({ where: { id: res.body.id } });
  });

  it('returns 409 on duplicate slug', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Duplicate Slug Test',
        slug: 'test-product-jest', // already exists
        price: 10,
        mainImage: 'test.webp',
        description: 'Test description',   // ← add this
        manufacturer: 'Test',
        categoryId: testCategoryId,
        inStock: 1,    
      });
    expect(res.status).toBe(409);
  });
});

// ─── PUT /api/products/:id ───────────────────────────────────────────────────

describe('PUT /api/products/:id', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .put(`/api/products/${testProductId}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent product', async () => {
    const res = await request(app)
      .put('/api/products/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('updates product successfully', async () => {
    const res = await request(app)
      .put(`/api/products/${testProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Test Product', price: 39.99 });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Test Product');
  });
});

// ─── DELETE /api/products/:id ────────────────────────────────────────────────

describe('DELETE /api/products/:id', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app).delete(`/api/products/${testProductId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent product', async () => {
    const res = await request(app)
      .delete('/api/products/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('deletes product successfully', async () => {
    // Create a product to delete
    const product = await prisma.product.create({
      data: {
        title: 'Delete Me Jest',
        slug: 'delete-me-jest',
        price: 10,
        rating: 5,
        description: 'To be deleted',
        manufacturer: 'Jest',
        mainImage: 'test.webp',
        categoryId: testCategoryId,
        merchantId: testMerchantId,
        inStock: 1,
      }
    });

    const res = await request(app)
      .delete(`/api/products/${product.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });
});
