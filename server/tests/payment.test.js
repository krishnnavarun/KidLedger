import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { setupTestDB, clearTestDB, teardownTestDB } from './setup.js';
import { Merchant, seedMerchants } from '../src/models/Merchant.js';
import { LedgerEntry } from '../src/models/LedgerEntry.js';
import { Wallet } from '../src/models/Wallet.js';

describe('Merchant Payments & Rule Enforcement (Phase 4)', () => {
  let parentToken;
  let childToken;
  let childId;
  let steamMerchant;
  let subwayMerchant;
  let bookMerchant;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    // 1. Seed merchants
    await seedMerchants();
    steamMerchant = await Merchant.findOne({ name: 'Steam Games' });
    subwayMerchant = await Merchant.findOne({ name: 'Subway' });
    bookMerchant = await Merchant.findOne({ name: 'Campus Bookstore' });

    // 2. Register parent
    const parentRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Sarah Connor',
      email: 'sarah@example.com',
      password: 'Password123!',
    });
    parentToken = parentRes.body.data.accessToken;

    // 3. Create child
    const childRes = await request(app)
      .post('/api/v1/family/children')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        name: 'John Connor',
        email: 'john@example.com',
        password: 'ChildPass123!',
      });
    childId = childRes.body.data.child.id;

    // 4. Log in as child to get childToken
    const childLoginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'john@example.com',
      password: 'ChildPass123!',
    });
    childToken = childLoginRes.body.data.accessToken;

    // 5. Fund parent wallet with 100,000 paise and transfer 50,000 paise to child
    await request(app)
      .post('/api/v1/wallets/topup')
      .set('Authorization', `Bearer ${parentToken}`)
      .set('Idempotency-Key', 'fund-parent-seed')
      .send({ amount: 100000 });

    await request(app)
      .post('/api/v1/wallets/transfer')
      .set('Authorization', `Bearer ${parentToken}`)
      .set('Idempotency-Key', 'fund-child-seed')
      .send({ childId, amount: 50000 });
  });

  describe('GET /api/v1/merchants', () => {
    it('should list all seeded merchants', async () => {
      const res = await request(app).get('/api/v1/merchants');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.merchants.length).toBeGreaterThan(0);
    });
  });

  describe('Parent Rule Management (/api/v1/rules)', () => {
    it('should allow parent to create a blocked category rule', async () => {
      const res = await request(app)
        .post('/api/v1/rules')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          childId,
          type: 'blocked_category',
          value: 'gaming',
          actionOnViolation: 'BLOCK',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rule.type).toBe('blocked_category');
      expect(res.body.data.rule.value).toBe('gaming');
    });

    it('should forbid a child from creating spending rules', async () => {
      const res = await request(app)
        .post('/api/v1/rules')
        .set('Authorization', `Bearer ${childToken}`)
        .send({
          childId,
          type: 'daily_limit',
          value: 10000,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Child Payments & Rule Execution (/api/v1/payments)', () => {
    it('should complete approved purchase when transaction satisfies all rules', async () => {
      const paymentAmount = 15000; // 150 INR at Subway

      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${childToken}`)
        .set('Idempotency-Key', 'pay-subway-001')
        .send({
          merchantId: subwayMerchant._id.toString(),
          amount: paymentAmount,
          note: 'Lunch at school',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.decision).toBe('APPROVE');

      // Verify child wallet balance reduced from 50,000 to 35,000
      const walletRes = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${childToken}`);
      expect(walletRes.body.data.wallet.balance).toBe(35000);

      // Verify ledger entry created
      const ledger = await LedgerEntry.find({ walletId: walletRes.body.data.wallet.id });
      // 1 transfer credit (50000) + 1 payment debit (15000) = 2 entries
      expect(ledger).toHaveLength(2);
      expect(ledger[1].direction).toBe('debit');
      expect(ledger[1].amount).toBe(paymentAmount);
      expect(ledger[1].balanceAfter).toBe(35000);
    });

    it('should decline purchase and NOT deduct balance when category is blocked', async () => {
      // 1. Parent blocks 'gaming'
      await request(app)
        .post('/api/v1/rules')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          childId,
          type: 'blocked_category',
          value: 'gaming',
          actionOnViolation: 'BLOCK',
        });

      // 2. Child tries to buy Steam Game
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${childToken}`)
        .set('Idempotency-Key', 'pay-steam-blocked')
        .send({
          merchantId: steamMerchant._id.toString(),
          amount: 20000,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('declined');
      expect(res.body.data.decision).toBe('BLOCK');
      expect(res.body.data.reason).toContain("category 'gaming' is blocked");

      // Balance must NOT change (still 50,000 paise)
      const walletRes = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${childToken}`);
      expect(walletRes.body.data.wallet.balance).toBe(50000);
    });

    it('should mark transaction as pending when per_txn_cap requires parent approval', async () => {
      // 1. Parent sets per-txn cap of 20,000 paise with action 'NEEDS_APPROVAL'
      await request(app)
        .post('/api/v1/rules')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          childId,
          type: 'per_txn_cap',
          value: 20000,
          actionOnViolation: 'NEEDS_APPROVAL',
        });

      // 2. Child attempts purchase of 30,000 paise at bookstore
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${childToken}`)
        .set('Idempotency-Key', 'pay-book-pending')
        .send({
          merchantId: bookMerchant._id.toString(),
          amount: 30000,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.decision).toBe('NEEDS_APPROVAL');

      const pendingTxnId = res.body.data.transaction.id;

      // Balance has not been deducted yet
      const walletRes = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${childToken}`);
      expect(walletRes.body.data.wallet.balance).toBe(50000);

      // 3. Parent approves the pending transaction
      const approveRes = await request(app)
        .post(`/api/v1/transactions/${pendingTxnId}/approve`)
        .set('Authorization', `Bearer ${parentToken}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.transaction.status).toBe('completed');

      // Balance is now deducted to 20,000 paise (50,000 - 30,000)
      const walletAfterApprove = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${childToken}`);
      expect(walletAfterApprove.body.data.wallet.balance).toBe(20000);
    });

    it('should mark transaction as declined when parent declines pending payment', async () => {
      // 1. Parent sets per-txn cap with NEEDS_APPROVAL
      await request(app)
        .post('/api/v1/rules')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          childId,
          type: 'per_txn_cap',
          value: 10000,
          actionOnViolation: 'NEEDS_APPROVAL',
        });

      // 2. Child attempts purchase
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${childToken}`)
        .set('Idempotency-Key', 'pay-decline-test')
        .send({
          merchantId: bookMerchant._id.toString(),
          amount: 25000,
        });

      const pendingTxnId = res.body.data.transaction.id;

      // 3. Parent declines
      const declineRes = await request(app)
        .post(`/api/v1/transactions/${pendingTxnId}/decline`)
        .set('Authorization', `Bearer ${parentToken}`)
        .send({ reason: 'Not necessary right now' });

      expect(declineRes.status).toBe(200);
      expect(declineRes.body.data.transaction.status).toBe('declined');

      // Balance is unchanged (50,000 paise)
      const walletRes = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${childToken}`);
      expect(walletRes.body.data.wallet.balance).toBe(50000);
    });

    it('should reject purchase when child has insufficient funds in wallet', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${childToken}`)
        .set('Idempotency-Key', 'insufficient-funds-child')
        .send({
          merchantId: subwayMerchant._id.toString(),
          amount: 9999999, // More than 50,000 paise
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('Peer-to-Peer Friend Payments by Phone Number (/api/v1/payments/peer)', () => {
    let friendToken;
    let friendPhone = '9876543210';
    let friendChildId;

    beforeEach(async () => {
      // Create a friend child account with phone number
      const friendRes = await request(app)
        .post('/api/v1/family/children')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          name: 'Rahul Sharma',
          email: 'rahul@example.com',
          password: 'FriendPassword123!',
          phoneNumber: friendPhone,
        });
      friendChildId = friendRes.body.data.child.id;
    });

    it('should successfully transfer money to a friend within the ₹300/day limit', async () => {
      const transferAmount = 15000; // ₹150 (<= ₹300 daily limit)

      const res = await request(app)
        .post('/api/v1/payments/peer')
        .set('Authorization', `Bearer ${childToken}`)
        .set('Idempotency-Key', 'p2p-transfer-001')
        .send({
          recipientPhone: friendPhone,
          amount: transferAmount,
          note: 'Split pizza bill',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.decision).toBe('APPROVE');

      // Sender balance decreased from 50,000 to 35,000
      const senderWallet = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${childToken}`);
      expect(senderWallet.body.data.wallet.balance).toBe(35000);

      // Recipient friend balance increased from 0 to 15,000
      const friendWallet = await Wallet.findOne({ ownerId: friendChildId });
      expect(friendWallet.balance).toBe(15000);

      // Verify 2 ledger entries created
      const senderLedger = await LedgerEntry.find({ walletId: senderWallet.body.data.wallet.id });
      expect(senderLedger.some((e) => e.direction === 'debit' && e.amount === transferAmount)).toBe(true);
    });

    it('should block transfer when exceeding the default ₹300/day friend transfer limit', async () => {
      // Attempting to send ₹350 (35,000 paise > 30,000 paise daily limit)
      const res = await request(app)
        .post('/api/v1/payments/peer')
        .set('Authorization', `Bearer ${childToken}`)
        .set('Idempotency-Key', 'p2p-exceed-limit')
        .send({
          recipientPhone: friendPhone,
          amount: 35000,
          note: 'Big loan',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('declined');
      expect(res.body.data.decision).toBe('BLOCK');
      expect(res.body.data.reason).toContain('Daily friend transfer limit of ₹300.00 exceeded');

      // Balance unchanged
      const senderWallet = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${childToken}`);
      expect(senderWallet.body.data.wallet.balance).toBe(50000);
    });

    it('should reject payment to non-existent phone number', async () => {
      const res = await request(app)
        .post('/api/v1/payments/peer')
        .set('Authorization', `Bearer ${childToken}`)
        .set('Idempotency-Key', 'p2p-nonexistent-phone')
        .send({
          recipientPhone: '0000000000',
          amount: 5000,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RECIPIENT_NOT_FOUND');
    });
  });

  describe('Shop QR Code Scan Payments (/api/v1/payments/scan)', () => {
    it('should parse shop QR code string and complete payment within rules', async () => {
      // Simulated UPI QR code payload from Subway
      const qrPayload = `upi://pay?pa=subway@upi&pn=Subway&merchantId=${subwayMerchant._id.toString()}&am=120.00`;

      const res = await request(app)
        .post('/api/v1/payments/scan')
        .set('Authorization', `Bearer ${childToken}`)
        .set('Idempotency-Key', 'scan-subway-001')
        .send({
          qrCode: qrPayload,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.decision).toBe('APPROVE');
      expect(res.body.data.transaction.amount).toBe(12000); // 120 INR = 12000 paise

      // Wallet reduced by 12,000 paise (50,000 -> 38,000)
      const walletRes = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${childToken}`);
      expect(walletRes.body.data.wallet.balance).toBe(38000);
    });
  });
});
