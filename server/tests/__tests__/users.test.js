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

let testUserId;
const TEST_EMAIL = 'jest-test-user@example.com';

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: 'jest' } } });
  const res = await request(app)
    .post('/api/users')
    .send({ email: TEST_EMAIL, password: 'Test@1234!' });
  testUserId = res.body.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: 'jest' } } });
  await prisma.$disconnect();
});

// ─── POST /api/users (register) ──────────────────────────────────────────────

describe('POST /api/users', () => {
  it('returns 400 when email missing', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ password: 'Test@1234!' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password missing', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'jest-nopw@example.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'not-an-email', password: 'Test@1234!' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for email that is too long', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'a'.repeat(250) + '@test.com', password: 'Test@1234!' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for XSS in email', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: '<script>alert(1)</script>@test.com', password: 'Test@1234!' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for SQL injection in email', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: "' OR 1=1; DROP TABLE users; --", password: 'Test@1234!' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for weak password — too short', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'jest-weak-short@example.com', password: 'weak' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for weak password — no uppercase', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'jest-weak-upper@example.com', password: 'test@1234' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for weak password — no special character', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'jest-weak-special@example.com', password: 'TestPass1234' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for weak password — no number', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'jest-weak-number@example.com', password: 'Test@Pass!' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for password exceeding 72 characters', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'jest-weak-long@example.com', password: 'Test@1234!' + 'a'.repeat(70) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'jest-badrole@example.com', password: 'Test@1234!', role: 'superadmin' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('user');
  });

  it('creates user successfully with valid data', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'jest-create-test@example.com', password: 'Test@1234!' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).not.toHaveProperty('password');
    expect(res.body.email).toBe('jest-create-test@example.com');
  });

  it('returns 409 on duplicate email', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'jest-create-test@example.com', password: 'Test@1234!' });
    expect(res.status).toBe(409);
  });

  it('never returns password in response', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'jest-another@example.com', password: 'Test@1234!' });
    expect(res.status).toBe(201);
    expect(res.body.password).toBeUndefined();
  });
});

// ─── GET /api/users ──────────────────────────────────────────────────────────

describe('GET /api/users', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('returns 200 with admin token', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('never returns passwords in user list', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.forEach(user => {
      expect(user.password).toBeUndefined();
    });
  });
});

// ─── GET /api/users/:id ──────────────────────────────────────────────────────

describe('GET /api/users/:id', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app).get(`/api/users/${testUserId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await request(app)
      .get('/api/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('returns user without password', async () => {
    const res = await request(app)
      .get(`/api/users/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', testUserId);
    expect(res.body.password).toBeUndefined();
  });
});

// ─── GET /api/users/email/:email ─────────────────────────────────────────────

describe('GET /api/users/email/:email', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app).get(`/api/users/email/${TEST_EMAIL}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent email', async () => {
    const res = await request(app)
      .get('/api/users/email/nobody@nowhere.com')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('returns user by email without password', async () => {
    const res = await request(app)
      .get(`/api/users/email/${TEST_EMAIL}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(TEST_EMAIL);
    expect(res.body.password).toBeUndefined();
  });
});

// ─── PUT /api/users/:id ──────────────────────────────────────────────────────

describe('PUT /api/users/:id', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .put(`/api/users/${testUserId}`)
      .send({ role: 'user' });
    expect(res.status).toBe(401);
  });
  it('ignores role field and always registers as user', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'jest-rolecheck@example.com', password: 'Test@1234!', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('user'); // role escalation silently ignored
  });
  it('returns 404 for non-existent user', async () => {
    const res = await request(app)
      .put('/api/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' });
    expect(res.status).toBe(404);
  });

  it('updates email successfully', async () => {
    const res = await request(app)
      .put(`/api/users/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'jest-updated@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('jest-updated@example.com');
    expect(res.body.password).toBeUndefined();
  });

  it('returns 400 for invalid email format on update', async () => {
    const res = await request(app)
      .put(`/api/users/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('updates role successfully', async () => {
    const res = await request(app)
      .put(`/api/users/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' });
    expect(res.status).toBe(200);
    expect(res.body.password).toBeUndefined();
  });

  it('never returns password after update', async () => {
    const res = await request(app)
      .put(`/api/users/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.password).toBeUndefined();
  });
});

// ─── DELETE /api/users/:id ───────────────────────────────────────────────────

describe('DELETE /api/users/:id', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app).delete(`/api/users/${testUserId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await request(app)
      .delete('/api/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('deletes user successfully', async () => {
    const res = await request(app)
      .delete(`/api/users/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });
});