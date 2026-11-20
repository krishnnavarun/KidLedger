import { Wallet } from '../models/Wallet.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { LedgerService } from '../services/ledger.service.js';
import { FamilyService } from '../services/family.service.js';
import { AppError } from '../middleware/errorHandler.js';

export class WalletController {
  static async getMyWallet(req, res, next) {
    try {
      const userId = req.user.id || req.user._id;
      const wallet = await Wallet.findOne({ ownerId: userId });
      if (!wallet) {
        throw new AppError('Wallet not found', 404, 'WALLET_NOT_FOUND');
      }

      // Fetch last 10 ledger entries
      const recentLedger = await LedgerEntry.find({ walletId: wallet._id })
        .sort({ createdAt: -1 })
        .limit(10);

      res.status(200).json({
        success: true,
        data: {
          wallet,
          recentLedger,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getChildWallet(req, res, next) {
    try {
      const parentId = req.user.id || req.user._id;
      const { childId } = req.params;

      // Verify parent has access to child
      await FamilyService.verifyParentChildAccess(parentId, childId);

      const wallet = await Wallet.findOne({ ownerId: childId });
      if (!wallet) {
        throw new AppError('Child wallet not found', 404, 'WALLET_NOT_FOUND');
      }

      const recentLedger = await LedgerEntry.find({ walletId: wallet._id })
        .sort({ createdAt: -1 })
        .limit(10);

      res.status(200).json({
        success: true,
        data: {
          wallet,
          recentLedger,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async topup(req, res, next) {
    try {
      const parentId = req.user.id || req.user._id;
      const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
      const { amount, metadata } = req.body;

      const result = await LedgerService.topupParentWallet({
        parentId,
        amount,
        idempotencyKey,
        metadata,
      });

      res.status(result.isDuplicate ? 200 : 201).json({
        success: true,
        data: {
          transaction: result.transaction,
          isDuplicate: result.isDuplicate,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async transfer(req, res, next) {
    try {
      const parentId = req.user.id || req.user._id;
      const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
      const { childId, amount, metadata } = req.body;

      const result = await LedgerService.transferParentToChild({
        parentId,
        childId,
        amount,
        idempotencyKey,
        metadata,
      });

      res.status(result.isDuplicate ? 200 : 201).json({
        success: true,
        data: {
          transaction: result.transaction,
          isDuplicate: result.isDuplicate,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async reconcile(req, res, next) {
    try {
      const { walletId } = req.params;
      const audit = await LedgerService.reconcileWallet(walletId);

      res.status(200).json({
        success: true,
        data: audit,
      });
    } catch (error) {
      next(error);
    }
  }
}
