import { Router } from 'express';
import { z } from 'zod';
import { RuleController } from '../controllers/rule.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createRuleSchema = z.object({
  childId: z.string().min(1, 'Child ID is required'),
  type: z.enum([
    'per_txn_cap',
    'daily_limit',
    'weekly_limit',
    'monthly_limit',
    'blocked_category',
    'blocked_merchant',
    'allow_only',
    'p2p_daily_limit',
  ]),
  value: z.any(),
  actionOnViolation: z.enum(['BLOCK', 'NEEDS_APPROVAL']).optional(),
});

const updateRuleSchema = z.object({
  active: z.boolean().optional(),
  value: z.any().optional(),
  actionOnViolation: z.enum(['BLOCK', 'NEEDS_APPROVAL']).optional(),
});

// All rule routes are strictly protected for Parents only
router.use(authenticate, requireRole('parent'));

router.post('/', validate(createRuleSchema), RuleController.createRule);
router.get('/', RuleController.getRulesForChild);
router.patch('/:id', validate(updateRuleSchema), RuleController.updateRule);
router.delete('/:id', RuleController.deleteRule);

export default router;
