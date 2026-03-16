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

function makeUserToken() {
  return jwt.sign(
    { id: 'user-id-001', role: 'user', iat: Math.floor(Date.now() / 1000) },
    process.env.NEXTAUTH_SECRET,
    { expiresIn: '15m' }
  );
}

let testCategoryId;

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { name: 'jest-test-category' }
  });
  testCategoryId = category.id;
});

afterAll(async () => {
  await prisma.category.deleteMany({ where: { name: { contains: 'jest' } } });
  await prisma.$disconnect();
});

// ─── GET /api/categories ─────────────────────────────────────────────────────

describe('GET /api/categories', () => {
  it('returns 200 with categories array', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns category objects with id and name', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
    }
  });
});

// ─── GET /api/categories/:id ─────────────────────────────────────────────────

describe('GET /api/categories/:id', () => {
  it('returns 200 with valid id', async () => {
    const res = await request(app).get(`/api/categories/${testCategoryId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', testCategoryId);
  });

  it('returns 404 for non-existent category', async () => {
    const res = await request(app).get('/api/categories/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/categories ────────────────────────────────────────────────────

describe('POST /api/categories', () => {
  const adminToken = makeAdminToken();
  const userToken = makeUserToken();

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post('/api/categories')
      .send({ name: 'new-category' });
    expect(res.status).toBe(401);
  });

  it('returns 403 with non-admin token', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'new-category' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when name missing', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('creates category successfully', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'jest-new-category' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('jest-new-category');

    await prisma.category.delete({ where: { id: res.body.id } });
  });

  it('returns 409 on duplicate category name', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'jest-test-category' }); // already exists
    expect(res.status).toBe(409);
  });
});

// ─── PUT /api/categories/:id ─────────────────────────────────────────────────

describe('PUT /api/categories/:id', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .put(`/api/categories/${testCategoryId}`)
      .send({ name: 'updated' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent category', async () => {
    const res = await request(app)
      .put('/api/categories/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'updated' });
    expect(res.status).toBe(404);
  });

  it('updates category successfully', async () => {
    const res = await request(app)
      .put(`/api/categories/${testCategoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'jest-updated-category' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('jest-updated-category');
  });
});

// ─── DELETE /api/categories/:id ──────────────────────────────────────────────

describe('DELETE /api/categories/:id', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app).delete(`/api/categories/${testCategoryId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent category', async () => {
    const res = await request(app)
      .delete('/api/categories/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('blocks deletion when category has products', async () => {
    // testCategoryId has a product from products.test.js seed
    // Even if not — we create one here to be sure
    const merchant = await prisma.merchant.findFirst();
    const product = await prisma.product.create({
      data: {
        title: 'Block Delete Jest',
        slug: 'block-delete-jest-cat',
        price: 10,
        rating: 5,
        description: 'Test',
        manufacturer: 'Test',
        mainImage: 'test.webp',
        categoryId: testCategoryId,
        merchantId: merchant.id,
        inStock: 1,
      }
    });

    const res = await request(app)
      .delete(`/api/categories/${testCategoryId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);

    await prisma.product.delete({ where: { id: product.id } });
  });

  it('deletes category with no products', async () => {
    const emptyCategory = await prisma.category.create({
      data: { name: 'jest-empty-category' }
    });

    const res = await request(app)
      .delete(`/api/categories/${emptyCategory.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });
});
