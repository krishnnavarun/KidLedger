import { Router } from 'express';
import { z } from 'zod';
import { WalletController } from '../controllers/wallet.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const topupSchema = z.object({
  amount: z.number().int().positive('Amount must be a positive integer in paise'),
  idempotencyKey: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const transferSchema = z.object({
  childId: z.string().min(1, 'Child ID is required'),
  amount: z.number().int().positive('Amount must be a positive integer in paise'),
  idempotencyKey: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// All wallet routes require authentication
router.use(authenticate);

// View own wallet
router.get('/me', WalletController.getMyWallet);

// Parent view child wallet
router.get('/:childId', requireRole('parent'), WalletController.getChildWallet);

// Parent top-up wallet (test simulation)
router.post('/topup', requireRole('parent'), validate(topupSchema), WalletController.topup);

// Parent transfer to child
router.post('/transfer', requireRole('parent'), validate(transferSchema), WalletController.transfer);

// Audit balance reconciliation
router.get('/:walletId/reconcile', WalletController.reconcile);

export default router;
