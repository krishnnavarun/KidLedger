import { Router } from 'express';
import { MerchantController } from '../controllers/merchant.controller.js';

const router = Router();

router.get('/', MerchantController.listMerchants);

export default router;
