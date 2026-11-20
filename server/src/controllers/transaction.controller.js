import { Transaction } from '../models/Transaction.js';
import { Wallet } from '../models/Wallet.js';
import { FamilyService } from '../services/family.service.js';
import { AppError } from '../middleware/errorHandler.js';

export class TransactionController {
  static async listTransactions(req, res, next) {
    try {
      const userId = req.user.id || req.user._id;
      const { status, category, type, limit = 50, page = 1, walletId } = req.query;

      let targetWalletIds = [];

      if (walletId) {
        const wallet = await Wallet.findById(walletId);
        if (!wallet) throw new AppError('Wallet not found', 404, 'WALLET_NOT_FOUND');

        if (req.user.role === 'child' && wallet.ownerId.toString() !== userId.toString()) {
          throw new AppError('Access denied', 403, 'FORBIDDEN');
        }
        if (req.user.role === 'parent' && wallet.ownerId.toString() !== userId.toString()) {
          // Verify parent-child relationship
          await FamilyService.verifyParentChildAccess(userId, wallet.ownerId);
        }
        targetWalletIds = [wallet._id];
      } else {
        // Default to user's own wallet
        const userWallet = await Wallet.findOne({ ownerId: userId });
        if (userWallet) {
          targetWalletIds = [userWallet._id];
        }
      }

      const query = {
        $or: [
          { fromWalletId: { $in: targetWalletIds } },
          { toWalletId: { $in: targetWalletIds } },
        ],
      };

      if (status) query.status = status;
      if (category) query.category = category;
      if (type) query.type = type;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const [transactions, total] = await Promise.all([
        Transaction.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        Transaction.countDocuments(query),
      ]);

      res.status(200).json({
        success: true,
        data: {
          transactions,
          pagination: {
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getTransactionById(req, res, next) {
    try {
      const { id } = req.params;
      const txn = await Transaction.findById(id);
      if (!txn) {
        throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: {
          transaction: txn,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
