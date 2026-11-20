import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { setupTestDB, clearTestDB, teardownTestDB } from './setup.js';
import { Wallet } from '../src/models/Wallet.js';
import { Notification } from '../src/models/Notification.js';
import { MoneyRequest } from '../src/models/MoneyRequest.js';

describe('Money Requests & Notifications (Phase 5)', () => {
  let parentToken;
  let childToken;
  let parentId;
  let childId;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    // 1. Register parent
    const parentRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Sarah Connor',
      email: 'sarah@example.com',
      password: 'Password123!',
      phoneNumber: '+919876543210',
    });
    parentToken = parentRes.body.data.accessToken;
    parentId = parentRes.body.data.user.id;

    // 2. Register child linked to parent
    const childRes = await request(app)
      .post('/api/v1/family/children')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        name: 'John Connor',
        email: 'john@example.com',
        password: 'ChildPass123!',
        phoneNumber: '+919876543211',
      });
    childId = childRes.body.data.child.id;

    // 3. Log in as child
    const childLoginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'john@example.com',
      password: 'ChildPass123!',
    });
    childToken = childLoginRes.body.data.accessToken;

    // 4. Fund parent wallet with 50,000 paise (₹500.00)
    await request(app)
      .post('/api/v1/wallets/topup')
      .set('Authorization', `Bearer ${parentToken}`)
      .set('Idempotency-Key', 'topup-parent-req-test')
      .send({ amount: 50000 });
  });

  describe('POST /api/v1/requests - Child creates a money request', () => {
    it('allows a linked child to submit a request and notifies the parent', async () => {
      const res = await request(app)
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${childToken}`)
        .send({
          amount: 15000, // ₹150.00
          reason: 'Need school science project supplies',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.request.amount).toBe(15000);
      expect(res.body.data.request.status).toBe('pending');
      expect(res.body.data.request.reason).toBe('Need school science project supplies');

      // Verify notification was sent to parent
      const notifications = await Notification.find({ userId: parentId });
      expect(notifications.length).toBe(1);
      expect(notifications[0].type).toBe('money_request');
      expect(notifications[0].title).toBe('New Money Request');
      expect(notifications[0].message).toContain('John Connor requested ₹150.00');
    });

    it('rejects request if submitted by a parent role', async () => {
      const res = await request(app)
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          amount: 5000,
          reason: 'Invalid role request',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('validates amount must be positive integer paise', async () => {
      const res = await request(app)
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${childToken}`)
        .send({
          amount: -500,
          reason: 'Negative amount',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/requests - Listing money requests', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${childToken}`)
        .send({
          amount: 10000,
          reason: 'Books',
        });

      await request(app)
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${childToken}`)
        .send({
          amount: 5000,
          reason: 'Snacks',
        });
    });

    it('allows parent to view all incoming requests from children', async () => {
      const res = await request(app)
        .get('/api/v1/requests')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.requests.length).toBe(2);
      expect(res.body.data.pagination.total).toBe(2);
    });

    it('allows child to view their outgoing requests', async () => {
      const res = await request(app)
        .get('/api/v1/requests')
        .set('Authorization', `Bearer ${childToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.requests.length).toBe(2);
    });
  });

  describe('POST /api/v1/requests/:id/approve - Parent approves money request', () => {
    let requestId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${childToken}`)
        .send({
          amount: 20000, // ₹200.00
          reason: 'School trip bus fee',
        });
      requestId = res.body.data.request.id;
    });

    it('transfers money atomically, updates request status, and notifies child', async () => {
      const approveRes = await request(app)
        .post(`/api/v1/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${parentToken}`)
        .set('Idempotency-Key', 'req-appr-test-1');

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.success).toBe(true);
      expect(approveRes.body.data.request.status).toBe('approved');
      expect(approveRes.body.data.transaction).toBeDefined();

      // Verify wallet balances: Parent had 50,000, now 30,000. Child had 0, now 20,000.
      const parentWallet = await Wallet.findOne({ ownerId: parentId });
      const childWallet = await Wallet.findOne({ ownerId: childId });

      expect(parentWallet.balance).toBe(30000);
      expect(childWallet.balance).toBe(20000);

      // Verify child notification
      const childNotifications = await Notification.find({ userId: childId, type: 'request_approved' });
      expect(childNotifications.length).toBe(1);
      expect(childNotifications[0].title).toContain('Approved');
    });

    it('rejects double approval with 400 INVALID_REQUEST_STATUS', async () => {
      // First approval
      await request(app)
        .post(`/api/v1/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${parentToken}`);

      // Second approval attempt
      const secondRes = await request(app)
        .post(`/api/v1/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${parentToken}`);

      expect(secondRes.status).toBe(400);
      expect(secondRes.body.error.code).toBe('INVALID_REQUEST_STATUS');
    });
  });

  describe('POST /api/v1/requests/:id/decline - Parent declines money request', () => {
    let requestId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${childToken}`)
        .send({
          amount: 25000,
          reason: 'Video game skin',
        });
      requestId = res.body.data.request.id;
    });

    it('marks request declined, records reason, notifies child, balances unchanged', async () => {
      const declineRes = await request(app)
        .post(`/api/v1/requests/${requestId}/decline`)
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          reason: 'Save your allowance for next month',
        });

      expect(declineRes.status).toBe(200);
      expect(declineRes.body.success).toBe(true);
      expect(declineRes.body.data.request.status).toBe('declined');
      expect(declineRes.body.data.request.decisionReason).toBe('Save your allowance for next month');

      // Balances unchanged
      const parentWallet = await Wallet.findOne({ ownerId: parentId });
      const childWallet = await Wallet.findOne({ ownerId: childId });
      expect(parentWallet.balance).toBe(50000);
      expect(childWallet.balance).toBe(0);

      // Verify child notification
      const childNotifications = await Notification.find({ userId: childId, type: 'request_declined' });
      expect(childNotifications.length).toBe(1);
      expect(childNotifications[0].message).toContain('Save your allowance for next month');
    });
  });

  describe('Notifications API (/api/v1/notifications)', () => {
    beforeEach(async () => {
      // Seed two notifications for parent
      await Notification.create([
        {
          userId: parentId,
          type: 'money_request',
          title: 'Notification 1',
          message: 'First test notification',
        },
        {
          userId: parentId,
          type: 'payment_pending',
          title: 'Notification 2',
          message: 'Second test notification',
        },
      ]);
    });

    it('fetches notifications and unread count', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.notifications.length).toBe(2);
      expect(res.body.data.unreadCount).toBe(2);
    });

    it('marks a single notification as read', async () => {
      const getRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${parentToken}`);

      const notifId = getRes.body.data.notifications[0].id;

      const patchRes = await request(app)
        .patch(`/api/v1/notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${parentToken}`);

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.notification.readAt).not.toBeNull();

      // Check unread count is now 1
      const countRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${parentToken}`);
      expect(countRes.body.data.unreadCount).toBe(1);
    });

    it('marks all notifications as read', async () => {
      const markAllRes = await request(app)
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(markAllRes.status).toBe(200);
      expect(markAllRes.body.data.modifiedCount).toBe(2);

      const countRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${parentToken}`);
      expect(countRes.body.data.unreadCount).toBe(0);
    });
  });
});
