import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

router.get('/', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      app: 'KidLedger Wallet API',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatusMap[dbState] || 'unknown',
    },
  });
});

export default router;
