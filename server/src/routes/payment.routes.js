import { Router } from 'express';
import { z } from 'zod';
import { PaymentController } from '../controllers/payment.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const payMerchantSchema = z.object({
  merchantId: z.string().min(1, 'Merchant ID is required'),
  amount: z.number().int().positive('Amount must be a positive integer in paise'),
  idempotencyKey: z.string().optional(),
  note: z.string().max(255).optional(),
});

const payPeerSchema = z.object({
  recipientPhone: z.string().trim().min(5, 'Valid recipient phone number is required'),
  amount: z.number().int().positive('Amount must be a positive integer in paise'),
  idempotencyKey: z.string().optional(),
  note: z.string().max(255).optional(),
});

const payScanSchema = z.object({
  qrCode: z.string().min(1, 'QR code payload is required'),
  amount: z.number().int().positive('Amount must be a positive integer in paise').optional(),
  idempotencyKey: z.string().optional(),
  note: z.string().max(255).optional(),
});

// Payments can strictly only be initiated by Child accounts
router.post(
  '/',
  authenticate,
  requireRole('child'),
  validate(payMerchantSchema),
  PaymentController.payMerchant
);

router.post(
  '/peer',
  authenticate,
  requireRole('child'),
  validate(payPeerSchema),
  PaymentController.payFriend
);

router.post(
  '/scan',
  authenticate,
  requireRole('child'),
  validate(payScanSchema),
  PaymentController.payByScan
);

export default router;
