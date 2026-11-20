import { Router } from 'express';
import { z } from 'zod';
import { RequestController } from '../controllers/request.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createRequestSchema = z.object({
  amount: z.number().int().positive('Amount must be a positive integer in paise'),
  reason: z.string().trim().min(2, 'Reason must be at least 2 characters').max(255),
});

const declineRequestSchema = z.object({
  reason: z.string().trim().max(255).optional(),
});

router.use(authenticate);

// Child creates a money request
router.post('/', requireRole('child'), validate(createRequestSchema), RequestController.createRequest);

// Both parents and children can list their requests
router.get('/', RequestController.getRequests);

// Parent approves or declines
router.post('/:id/approve', requireRole('parent'), RequestController.approveRequest);
router.post('/:id/decline', requireRole('parent'), validate(declineRequestSchema), RequestController.declineRequest);

export default router;
