import { Router } from 'express';
import { TransactionController } from '../controllers/transaction.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', TransactionController.listTransactions);
router.get('/:id', TransactionController.getTransactionById);

export default router;
