import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import familyRoutes from './routes/family.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import transactionRoutes from './routes/transaction.routes.js';
import merchantRoutes from './routes/merchant.routes.js';
import ruleRoutes from './routes/rule.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import requestRoutes from './routes/request.routes.js';
import notificationRoutes from './routes/notification.routes.js';

export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    })
  );

  // Body parsing & cookies
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Logging in development/production (skip in test to keep test output clean)
  if (env.NODE_ENV !== 'test') {
    app.use(requestLogger);
  }

  // Root welcome route
  app.get('/', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Welcome to KidLedger Wallet API',
      version: 'v1',
      health: '/api/v1/health',
      endpoints: {
        health: 'GET /api/v1/health',
        auth: '/api/v1/auth',
        family: '/api/v1/family',
        wallets: '/api/v1/wallets',
        transactions: '/api/v1/transactions',
        merchants: '/api/v1/merchants',
        rules: '/api/v1/rules',
        payments: '/api/v1/payments',
        requests: '/api/v1/requests',
        notifications: '/api/v1/notifications',
      },
    });
  });

  // API v1 Routes
  app.use('/api/v1/health', healthRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/family', familyRoutes);
  app.use('/api/v1/wallets', walletRoutes);
  app.use('/api/v1/transactions', transactionRoutes);
  app.use('/api/v1/merchants', merchantRoutes);
  app.use('/api/v1/rules', ruleRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  app.use('/api/v1/requests', requestRoutes);
  app.use('/api/v1/notifications', notificationRoutes);

  // 404 and Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
