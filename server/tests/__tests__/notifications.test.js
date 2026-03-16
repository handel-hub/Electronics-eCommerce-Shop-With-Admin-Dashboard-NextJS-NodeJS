    const request = require('supertest');
    const app = require('../../app');
    const prisma = require('../../utills/db');
    const jwt = require('jsonwebtoken');

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

    let testUserId;
    let testNotificationId;

    beforeAll(async () => {
    const user = await prisma.user.upsert({
        where: { email: 'jest-notify@test.com' },
        update: {},
        create: {
        email: 'jest-notify@test.com',
        password: 'hashed_password_placeholder',
        role: 'user',
        }
    });
    testUserId = user.id;

    const notification = await prisma.notification.create({
        data: {
        userId: testUserId,
        title: 'Jest Test Notification',
        message: 'This is a test notification',
        type: 'ORDER_UPDATE',
        priority: 'NORMAL',
        isRead: false,
        }
    });
    testNotificationId = notification.id;
    });

    afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { email: 'jest-notify@test.com' } });
    await prisma.$disconnect();
    });

    // ─── GET /:userId ────────────────────────────────────────────────────────────

    describe('GET /api/notifications/:userId', () => {
    it('returns 401 with no token', async () => {
        const res = await request(app).get(`/api/notifications/${testUserId}`);
        expect(res.status).toBe(401);
    });

    it('returns 403 when accessing another user notifications', async () => {
        const otherToken = makeUserToken({ id: 'other-user-id' });
        const res = await request(app)
        .get(`/api/notifications/${testUserId}`)
        .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(403);
    });

    it('returns 200 for own notifications', async () => {
        const token = makeUserToken({ id: testUserId });
        const res = await request(app)
        .get(`/api/notifications/${testUserId}`)
        .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('notifications');
        expect(Array.isArray(res.body.notifications)).toBe(true);
    });

    it('admin can access any user notifications', async () => {
        const adminToken = makeAdminToken();
        const res = await request(app)
        .get(`/api/notifications/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
    });

    it('returns pagination metadata', async () => {
        const token = makeUserToken({ id: testUserId });
        const res = await request(app)
        .get(`/api/notifications/${testUserId}`)
        .set('Authorization', `Bearer ${token}`);
        expect(res.body).toHaveProperty('total');
        expect(res.body).toHaveProperty('totalPages');
        expect(res.body).toHaveProperty('unreadCount');
    });
    });

    // ─── GET /:userId/unread-count ───────────────────────────────────────────────

    describe('GET /api/notifications/:userId/unread-count', () => {
    it('returns 401 with no token', async () => {
        const res = await request(app).get(`/api/notifications/${testUserId}/unread-count`);
        expect(res.status).toBe(401);
    });

    it('returns 403 when accessing another user unread count', async () => {
        const otherToken = makeUserToken({ id: 'other-user-id' });
        const res = await request(app)
        .get(`/api/notifications/${testUserId}/unread-count`)
        .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(403);
    });

    it('returns unread count for own notifications', async () => {
        const token = makeUserToken({ id: testUserId });
        const res = await request(app)
        .get(`/api/notifications/${testUserId}/unread-count`)
        .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('unreadCount');
        expect(typeof res.body.unreadCount).toBe('number');
    });
    });

    // ─── POST / ──────────────────────────────────────────────────────────────────

    describe('POST /api/notifications', () => {
    const adminToken = makeAdminToken();
    const userToken = makeUserToken();

    it('returns 401 with no token', async () => {
        const res = await request(app).post('/api/notifications').send({});
        expect(res.status).toBe(401);
    });

    it('returns 403 with non-admin token', async () => {
        const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${userToken}`)
        .send({});
        expect(res.status).toBe(403);
    });

    it('returns 400 when required fields missing', async () => {
        const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: testUserId });
        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid type', async () => {
        const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
            userId: testUserId,
            title: 'Test',
            message: 'Test message',
            type: 'INVALID_TYPE',
        });
        expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent user', async () => {
        const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
            userId: '00000000-0000-0000-0000-000000000000',
            title: 'Test',
            message: 'Test message',
            type: 'ORDER_UPDATE',
        });
        expect(res.status).toBe(404);
    });

    it('creates notification successfully', async () => {
        const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
            userId: testUserId,
            title: 'Jest Created',
            message: 'Created in test',
            type: 'ORDER_UPDATE',
            priority: 'HIGH',
        });
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');

        await prisma.notification.delete({ where: { id: res.body.id } });
    });
    });

    // ─── PUT /:id ────────────────────────────────────────────────────────────────

    describe('PUT /api/notifications/:id', () => {
    it('returns 401 with no token', async () => {
        const res = await request(app)
        .put(`/api/notifications/${testNotificationId}`)
        .send({ isRead: true, userId: testUserId });
        expect(res.status).toBe(401);
    });

    it('returns 400 when isRead is not boolean', async () => {
        const token = makeUserToken({ id: testUserId });
        const res = await request(app)
        .put(`/api/notifications/${testNotificationId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isRead: 'yes', userId: testUserId });
        expect(res.status).toBe(400);
    });

    it('returns 404 when notification does not belong to user', async () => {
        const otherToken = makeUserToken({ id: 'other-user-id' });
        const res = await request(app)
        .put(`/api/notifications/${testNotificationId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ isRead: true, userId: 'other-user-id' });
        expect(res.status).toBe(404);
    });

    it('marks notification as read successfully', async () => {
        const token = makeUserToken({ id: testUserId });
        const res = await request(app)
        .put(`/api/notifications/${testNotificationId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isRead: true, userId: testUserId });
        expect(res.status).toBe(200);
        expect(res.body.isRead).toBe(true);
    });
    });

    // ─── POST /mark-read ─────────────────────────────────────────────────────────

    describe('POST /api/notifications/mark-read', () => {
    it('returns 401 with no token', async () => {
        const res = await request(app)
        .post('/api/notifications/mark-read')
        .send({ notificationIds: [testNotificationId], userId: testUserId });
        expect(res.status).toBe(401);
    });

    it('returns 400 when notificationIds is empty', async () => {
        const token = makeUserToken({ id: testUserId });
        const res = await request(app)
        .post('/api/notifications/mark-read')
        .set('Authorization', `Bearer ${token}`)
        .send({ notificationIds: [], userId: testUserId });
        expect(res.status).toBe(400);
    });

    it('bulk marks notifications as read', async () => {
        const token = makeUserToken({ id: testUserId });
        const res = await request(app)
        .post('/api/notifications/mark-read')
        .set('Authorization', `Bearer ${token}`)
        .send({ notificationIds: [testNotificationId], userId: testUserId });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('updatedCount');
    });
    });

    // ─── DELETE /:id ─────────────────────────────────────────────────────────────

    describe('DELETE /api/notifications/:id', () => {
    it('returns 401 with no token', async () => {
        const res = await request(app)
        .delete(`/api/notifications/${testNotificationId}`)
        .send({ userId: testUserId });
        expect(res.status).toBe(401);
    });

    it('returns 404 when notification does not belong to user', async () => {
        const otherToken = makeUserToken({ id: 'other-user-id' });
        const res = await request(app)
        .delete(`/api/notifications/${testNotificationId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ userId: 'other-user-id' });
        expect(res.status).toBe(404);
    });

    it('deletes notification successfully', async () => {
        const notification = await prisma.notification.create({
        data: {
            userId: testUserId,
            title: 'Delete Me',
            message: 'To be deleted',
            type: 'SYSTEM_ALERT',
            priority: 'LOW',
            isRead: false,
        }
        });

        const token = makeUserToken({ id: testUserId });
        const res = await request(app)
        .delete(`/api/notifications/${notification.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: testUserId });
        expect(res.status).toBe(200);
    });
    });

    // ─── DELETE /bulk ─────────────────────────────────────────────────────────────

    describe('DELETE /api/notifications/bulk', () => {
    const adminToken = makeAdminToken();

    it('returns 401 with no token', async () => {
        const res = await request(app)
        .delete('/api/notifications/bulk')
        .send({ notificationIds: [testNotificationId], userId: testUserId });
        expect(res.status).toBe(401);
    });

    it('returns 403 with non-admin token', async () => {
        const userToken = makeUserToken();
        const res = await request(app)
        .delete('/api/notifications/bulk')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ notificationIds: [testNotificationId], userId: testUserId });
        expect(res.status).toBe(403);
    });

    it('returns 400 when notificationIds is empty', async () => {
        const res = await request(app)
        .delete('/api/notifications/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notificationIds: [], userId: testUserId });
        expect(res.status).toBe(400);
    });

    it('bulk deletes notifications successfully', async () => {
        const n1 = await prisma.notification.create({
        data: {
            userId: testUserId,
            title: 'Bulk Delete 1',
            message: 'Test',
            type: 'SYSTEM_ALERT',
            priority: 'LOW',
            isRead: false,
        }
        });
        const n2 = await prisma.notification.create({
        data: {
            userId: testUserId,
            title: 'Bulk Delete 2',
            message: 'Test',
            type: 'SYSTEM_ALERT',
            priority: 'LOW',
            isRead: false,
        }
        });

        const res = await request(app)
        .delete('/api/notifications/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notificationIds: [n1.id, n2.id], userId: testUserId });
        expect(res.status).toBe(200);
        expect(res.body.deletedCount).toBe(2);
    });
    });