import { Router } from 'express';
import { TransactionController } from '../controllers/transaction.controller.js';
import { PaymentController } from '../controllers/payment.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', TransactionController.listTransactions);
router.get('/:id', TransactionController.getTransactionById);

// Parent approval workflow
router.post('/:id/approve', requireRole('parent'), PaymentController.approvePayment);
router.post('/:id/decline', requireRole('parent'), PaymentController.declinePayment);

export default router;
