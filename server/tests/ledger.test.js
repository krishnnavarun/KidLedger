import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { setupTestDB, clearTestDB, teardownTestDB } from './setup.js';
import { LedgerEntry } from '../src/models/LedgerEntry.js';
import { Wallet } from '../src/models/Wallet.js';

describe('Ledger & Idempotent Transactions (Phase 3)', () => {
  let parentToken;
  let childId;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    // Register parent
    const parentRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Bruce Wayne',
      email: 'bruce@wayne.com',
      password: 'DarkKnight2026!',
    });
    parentToken = parentRes.body.data.accessToken;

    // Create child
    const childRes = await request(app)
      .post('/api/v1/family/children')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        name: 'Damian Wayne',
        email: 'damian@wayne.com',
        password: 'RobinPassword2026!',
        dateOfBirth: '2014-05-10',
      });
    childId = childRes.body.data.child.id;
  });

  describe('Wallet Auto-Creation & Verification', () => {
    it('should have initialized wallets with 0 balance for parent and child', async () => {
      const parentWalletRes = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(parentWalletRes.status).toBe(200);
      expect(parentWalletRes.body.data.wallet.balance).toBe(0);
      expect(parentWalletRes.body.data.wallet.type).toBe('parent');

      const childWalletRes = await request(app)
        .get(`/api/v1/wallets/${childId}`)
        .set('Authorization', `Bearer ${parentToken}`);

      expect(childWalletRes.status).toBe(200);
      expect(childWalletRes.body.data.wallet.balance).toBe(0);
      expect(childWalletRes.body.data.wallet.type).toBe('child');
    });
  });

  describe('Parent Wallet Top-Up (Simulation)', () => {
    it('should top up parent wallet and write an append-only ledger entry', async () => {
      const topupAmount = 50000; // 500.00 INR in paise
      const idempotencyKey = 'topup-key-001';

      const res = await request(app)
        .post('/api/v1/wallets/topup')
        .set('Authorization', `Bearer ${parentToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ amount: topupAmount });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transaction.amount).toBe(topupAmount);
      expect(res.body.data.transaction.status).toBe('completed');
      expect(res.body.data.isDuplicate).toBe(false);

      // Verify wallet balance
      const walletRes = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${parentToken}`);
      expect(walletRes.body.data.wallet.balance).toBe(topupAmount);

      // Verify ledger entry
      const parentWalletId = walletRes.body.data.wallet.id;
      const ledgerEntries = await LedgerEntry.find({ walletId: parentWalletId });
      expect(ledgerEntries).toHaveLength(1);
      expect(ledgerEntries[0].direction).toBe('credit');
      expect(ledgerEntries[0].amount).toBe(topupAmount);
      expect(ledgerEntries[0].balanceAfter).toBe(topupAmount);
    });

    it('should return identical transaction and NOT double-credit on duplicate Idempotency-Key', async () => {
      const topupAmount = 25000;
      const idempotencyKey = 'topup-key-duplicate-test';

      // First call
      const firstRes = await request(app)
        .post('/api/v1/wallets/topup')
        .set('Authorization', `Bearer ${parentToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ amount: topupAmount });

      expect(firstRes.status).toBe(201);
      expect(firstRes.body.data.isDuplicate).toBe(false);

      // Duplicate retry with same idempotency key
      const secondRes = await request(app)
        .post('/api/v1/wallets/topup')
        .set('Authorization', `Bearer ${parentToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ amount: topupAmount });

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.isDuplicate).toBe(true);
      expect(secondRes.body.data.transaction._id).toBe(firstRes.body.data.transaction._id);

      // Balance should be exactly 25000 paise (not 50000!)
      const walletRes = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${parentToken}`);
      expect(walletRes.body.data.wallet.balance).toBe(topupAmount);
    });

    it('should reject non-integer float amounts', async () => {
      const res = await request(app)
        .post('/api/v1/wallets/topup')
        .set('Authorization', `Bearer ${parentToken}`)
        .set('Idempotency-Key', 'invalid-float-key')
        .send({ amount: 99.99 }); // Float not allowed

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Parent -> Child Transfer with Multi-Document ACID Transactions', () => {
    beforeEach(async () => {
      // Seed parent wallet with 100,000 paise (1,000 INR)
      await request(app)
        .post('/api/v1/wallets/topup')
        .set('Authorization', `Bearer ${parentToken}`)
        .set('Idempotency-Key', 'seed-parent-topup')
        .send({ amount: 100000 });
    });

    it('should transfer money from parent to child atomically and record 2 ledger entries', async () => {
      const transferAmount = 30000; // 300 INR
      const idempotencyKey = 'transfer-key-001';

      const res = await request(app)
        .post('/api/v1/wallets/transfer')
        .set('Authorization', `Bearer ${parentToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          childId,
          amount: transferAmount,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transaction.amount).toBe(transferAmount);
      expect(res.body.data.transaction.status).toBe('completed');

      // Parent balance should now be 100,000 - 30,000 = 70,000 paise
      const parentWalletRes = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${parentToken}`);
      expect(parentWalletRes.body.data.wallet.balance).toBe(70000);

      // Child balance should now be 30,000 paise
      const childWalletRes = await request(app)
        .get(`/api/v1/wallets/${childId}`)
        .set('Authorization', `Bearer ${parentToken}`);
      expect(childWalletRes.body.data.wallet.balance).toBe(30000);

      // Audit Ledger Entries:
      // Parent: 1 topup credit (100000) + 1 transfer debit (30000) = 2 entries
      const parentEntries = await LedgerEntry.find({ walletId: parentWalletRes.body.data.wallet.id });
      expect(parentEntries).toHaveLength(2);
      expect(parentEntries[1].direction).toBe('debit');
      expect(parentEntries[1].amount).toBe(transferAmount);
      expect(parentEntries[1].balanceAfter).toBe(70000);

      // Child: 1 transfer credit (30000) = 1 entry
      const childEntries = await LedgerEntry.find({ walletId: childWalletRes.body.data.wallet.id });
      expect(childEntries).toHaveLength(1);
      expect(childEntries[0].direction).toBe('credit');
      expect(childEntries[0].amount).toBe(transferAmount);
      expect(childEntries[0].balanceAfter).toBe(30000);
    });

    it('should reject transfer when parent has insufficient funds', async () => {
      const transferAmount = 99999999; // More than 100,000 paise
      const res = await request(app)
        .post('/api/v1/wallets/transfer')
        .set('Authorization', `Bearer ${parentToken}`)
        .set('Idempotency-Key', 'insufficient-funds-key')
        .send({
          childId,
          amount: transferAmount,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');

      // Verify no money was deducted
      const parentWalletRes = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${parentToken}`);
      expect(parentWalletRes.body.data.wallet.balance).toBe(100000);
    });

    it('should reconcile wallet balance with 100% precision against ledger entries', async () => {
      // Perform transfer
      await request(app)
        .post('/api/v1/wallets/transfer')
        .set('Authorization', `Bearer ${parentToken}`)
        .set('Idempotency-Key', 'audit-reconcile-key')
        .send({
          childId,
          amount: 40000,
        });

      const parentWalletRes = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${parentToken}`);
      const parentWalletId = parentWalletRes.body.data.wallet.id;

      // Call reconciliation audit endpoint
      const auditRes = await request(app)
        .get(`/api/v1/wallets/${parentWalletId}/reconcile`)
        .set('Authorization', `Bearer ${parentToken}`);

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.data.isConsistent).toBe(true);
      expect(auditRes.body.data.storedBalance).toBe(60000);
      expect(auditRes.body.data.reconciledBalance).toBe(60000);
    });

    it('should prevent mutating an append-only LedgerEntry document', async () => {
      const entry = await LedgerEntry.findOne();
      expect(entry).toBeDefined();

      // Attempting to update an existing ledger entry must throw
      await expect(
        LedgerEntry.updateOne({ _id: entry._id }, { amount: 999999 })
      ).rejects.toThrow('FATAL: LedgerEntry is immutable');
    });
  });
});
