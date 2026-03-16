/* const request = require('supertest');
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

function makeUserToken(userId = 'user-id-001') {
  return jwt.sign(
    { id: userId, role: 'user', iat: Math.floor(Date.now() / 1000) },
    process.env.NEXTAUTH_SECRET,
    { expiresIn: '15m' }
  );
}

function makeExpiredToken() {
  return jwt.sign(
    { id: 'user-id-001', role: 'user', iat: Math.floor(Date.now() / 1000) - 9999 },
    process.env.NEXTAUTH_SECRET,
    { expiresIn: '1ms' }
  );
}

let testUserId;
let testNotificationId;
let testMerchantId;

beforeAll(async () => {
  // Create test user
  const user = await prisma.user.create({
    data: {
      email: 'jest-notif-user@example.com',
      password: 'hashed',
      role: 'user',
    }
  });
  testUserId = user.id;

  // Create test notification
  const notification = await prisma.notification.create({
    data: {
      userId: testUserId,
      title: 'Jest Test Notification',
      message: 'This is a test notification',
      type: 'SYSTEM_ALERT',
      priority: 'NORMAL',
    }
  });
  testNotificationId = notification.id;

  // Get merchant
  const merchant = await prisma.merchant.findFirst();
  testMerchantId = process.env.STORE_MERCHANT_ID;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: testUserId } });
  await prisma.user.deleteMany({ where: { email: { contains: 'jest-notif' } } });
  await prisma.merchant.deleteMany({ where: { name: { contains: 'jest' } } });
  await prisma.$disconnect();
});

// ─── Auth Middleware ──────────────────────────────────────────────────────────

describe('Auth Middleware', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentication required/i);
  });

  it('returns 401 with malformed Bearer token', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'NotBearer token123');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer completelyinvalidtoken');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid token/i);
  });

  it('returns 401 with expired token', async () => {
    await new Promise(r => setTimeout(r, 50)); // wait for token to expire
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${makeExpiredToken()}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 with token signed by wrong secret', async () => {
    const wrongToken = jwt.sign(
      { id: 'admin-id-001', role: 'admin' },
      'wrong-secret',
      { expiresIn: '15m' }
    );
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${wrongToken}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user role tries admin route', async () => {
    const res = await request(app)
      .delete('/api/products/some-id')
      .set('Authorization', `Bearer ${makeUserToken()}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });
});

// ─── GET /api/notifications/:userId ──────────────────────────────────────────

describe('GET /api/notifications/:userId', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get(`/api/notifications/${testUserId}`);
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token', async () => {
    const res = await request(app)
      .get(`/api/notifications/${testUserId}`)
      .set('Authorization', `Bearer ${makeUserToken(testUserId)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('notifications');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('unreadCount');
  });

  it('supports type filter', async () => {
    const res = await request(app)
      .get(`/api/notifications/${testUserId}?type=SYSTEM_ALERT`)
      .set('Authorization', `Bearer ${makeUserToken(testUserId)}`);
    expect(res.status).toBe(200);
  });

  it('supports isRead filter', async () => {
    const res = await request(app)
      .get(`/api/notifications/${testUserId}?isRead=false`)
      .set('Authorization', `Bearer ${makeUserToken(testUserId)}`);
    expect(res.status).toBe(200);
  });

  it('supports search filter', async () => {
    const res = await request(app)
      .get(`/api/notifications/${testUserId}?search=jest`)
      .set('Authorization', `Bearer ${makeUserToken(testUserId)}`);
    expect(res.status).toBe(200);
  });

  it('supports pagination', async () => {
    const res = await request(app)
      .get(`/api/notifications/${testUserId}?page=1&limit=5`)
      .set('Authorization', `Bearer ${makeUserToken(testUserId)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalPages');
  });
});

// ─── GET /api/notifications/:userId/unread-count ─────────────────────────────

describe('GET /api/notifications/:userId/unread-count', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get(`/api/notifications/${testUserId}/unread-count`);
    expect(res.status).toBe(401);
  });

  it('returns unread count', async () => {
    const res = await request(app)
      .get(`/api/notifications/${testUserId}/unread-count`)
      .set('Authorization', `Bearer ${makeUserToken(testUserId)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('unreadCount');
    expect(typeof res.body.unreadCount).toBe('number');
  });
});

// ─── POST /api/notifications ─────────────────────────────────────────────────

describe('POST /api/notifications', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .send({ userId: testUserId, title: 'Test', message: 'Test', type: 'SYSTEM_ALERT' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when userId missing', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test', message: 'Test', type: 'SYSTEM_ALERT' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid type', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: testUserId, title: 'Test', message: 'Test', type: 'INVALID_TYPE' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid priority', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: testUserId, title: 'Test', message: 'Test', type: 'SYSTEM_ALERT', priority: 'SUPER_URGENT' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: '00000000-0000-0000-0000-000000000000', title: 'Test', message: 'Test', type: 'SYSTEM_ALERT' });
    expect(res.status).toBe(404);
  });

  it('creates notification successfully', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: testUserId,
        title: 'Jest Created',
        message: 'Jest notification message',
        type: 'ORDER_UPDATE',
        priority: 'HIGH',
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });
});

// ─── PUT /api/notifications/:id ──────────────────────────────────────────────

describe('PUT /api/notifications/:id', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app)
      .put(`/api/notifications/${testNotificationId}`)
      .send({ isRead: true, userId: testUserId });
    expect(res.status).toBe(401);
  });

  it('returns 400 when isRead is not boolean', async () => {
    const res = await request(app)
      .put(`/api/notifications/${testNotificationId}`)
      .set('Authorization', `Bearer ${makeUserToken(testUserId)}`)
      .send({ isRead: 'yes', userId: testUserId });
    expect(res.status).toBe(400);
  });

  it('returns 404 when notification belongs to different user', async () => {
    const res = await request(app)
      .put(`/api/notifications/${testNotificationId}`)
      .set('Authorization', `Bearer ${makeUserToken('different-user-id')}`)
      .send({ isRead: true, userId: 'different-user-id' });
    expect(res.status).toBe(404);
  });

  it('marks notification as read successfully', async () => {
    const res = await request(app)
      .put(`/api/notifications/${testNotificationId}`)
      .set('Authorization', `Bearer ${makeUserToken(testUserId)}`)
      .send({ isRead: true, userId: testUserId });
    expect(res.status).toBe(200);
    expect(res.body.isRead).toBe(true);
  });
});

// ─── POST /api/notifications/mark-read ───────────────────────────────────────

describe('POST /api/notifications/mark-read', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post('/api/notifications/mark-read')
      .send({ notificationIds: [testNotificationId], userId: testUserId });
    expect(res.status).toBe(401);
  });

  it('returns 400 when notificationIds not array', async () => {
    const res = await request(app)
      .post('/api/notifications/mark-read')
      .set('Authorization', `Bearer ${makeUserToken(testUserId)}`)
      .send({ notificationIds: 'not-array', userId: testUserId });
    expect(res.status).toBe(400);
  });

  it('returns 400 when notificationIds empty array', async () => {
    const res = await request(app)
      .post('/api/notifications/mark-read')
      .set('Authorization', `Bearer ${makeUserToken(testUserId)}`)
      .send({ notificationIds: [], userId: testUserId });
    expect(res.status).toBe(400);
  });

  it('bulk marks notifications as read', async () => {
    const res = await request(app)
      .post('/api/notifications/mark-read')
      .set('Authorization', `Bearer ${makeUserToken(testUserId)}`)
      .send({ notificationIds: [testNotificationId], userId: testUserId });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('updatedCount');
  });

  it('silently ignores IDs belonging to other users', async () => {
    const res = await request(app)
      .post('/api/notifications/mark-read')
      .set('Authorization', `Bearer ${makeUserToken('other-user')}`)
      .send({ notificationIds: [testNotificationId], userId: 'other-user' });
    expect(res.status).toBe(200);
    expect(res.body.updatedCount).toBe(0); // 0 updated — wrong user
  });
});

// ─── DELETE /api/notifications/:id ───────────────────────────────────────────

describe('DELETE /api/notifications/:id', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app)
      .delete(`/api/notifications/${testNotificationId}`)
      .send({ userId: testUserId });
    expect(res.status).toBe(401);
  });

  it('returns 404 when notification belongs to different user', async () => {
    const res = await request(app)
      .delete(`/api/notifications/${testNotificationId}`)
      .set('Authorization', `Bearer ${makeUserToken('other-user')}`)
      .send({ userId: 'other-user' });
    expect(res.status).toBe(404);
  });

  it('deletes notification successfully', async () => {
    const notif = await prisma.notification.create({
      data: {
        userId: testUserId,
        title: 'Delete Me',
        message: 'To be deleted',
        type: 'SYSTEM_ALERT',
        priority: 'LOW',
      }
    });

    const res = await request(app)
      .delete(`/api/notifications/${notif.id}`)
      .set('Authorization', `Bearer ${makeUserToken(testUserId)}`)
      .send({ userId: testUserId });
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/merchants ──────────────────────────────────────────────────────

describe('GET /api/merchants', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/merchants');
    expect(res.status).toBe(401);
  });

  it('returns 200 with admin token', async () => {
    const res = await request(app)
      .get('/api/merchants')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── POST /api/merchants ─────────────────────────────────────────────────────

describe('POST /api/merchants', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post('/api/merchants')
      .send({ name: 'Jest Merchant' });
    expect(res.status).toBe(401);
  });

  it('creates merchant successfully', async () => {
    const res = await request(app)
      .post('/api/merchants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'jest-merchant-test', status: 'ACTIVE' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });
});

// ─── PUT /api/merchants/:id ──────────────────────────────────────────────────

describe('PUT /api/merchants/:id', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .put(`/api/merchants/${testMerchantId}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent merchant', async () => {
    const res = await request(app)
      .put('/api/merchants/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('updates merchant successfully', async () => {
    const res = await request(app)
      .put(`/api/merchants/${testMerchantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Merchant Name' });
    expect(res.status).toBe(200);
  });
});

// ─── DELETE /api/merchants/:id ───────────────────────────────────────────────

describe('DELETE /api/merchants/:id', () => {
  const adminToken = makeAdminToken();

  it('returns 401 with no token', async () => {
    const res = await request(app).delete(`/api/merchants/${testMerchantId}`);
    expect(res.status).toBe(401);
  });

  it('blocks deletion when merchant has products', async () => {
    const res = await request(app)
      .delete(`/api/merchants/${testMerchantId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/products/i);
  });

  it('deletes merchant with no products', async () => {
    const merchant = await prisma.merchant.create({
      data: { name: 'jest-empty-merchant', status: 'ACTIVE' }
    });

    const res = await request(app)
      .delete(`/api/merchants/${merchant.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────

describe('404 Handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/this-route-does-not-exist');
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown POST routes', async () => {
    const res = await request(app).post('/api/nonexistent');
    expect(res.status).toBe(404);
  });
});

// ─── Health Check ─────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});
 */