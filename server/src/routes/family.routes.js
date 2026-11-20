import { Router } from 'express';
import { z } from 'zod';
import { FamilyController } from '../controllers/family.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createChildSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phoneNumber: z.string().trim().optional(),
  dateOfBirth: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Valid date of birth (YYYY-MM-DD) is required',
    })
    .optional(),
});

router.post(
  '/children',
  authenticate,
  requireRole('parent'),
  validate(createChildSchema),
  FamilyController.createChild
);

router.get(
  '/children',
  authenticate,
  requireRole('parent'),
  FamilyController.getChildren
);

export default router;
