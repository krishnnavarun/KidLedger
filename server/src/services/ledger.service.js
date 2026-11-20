import mongoose from 'mongoose';
import { Wallet } from '../models/Wallet.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { Transaction } from '../models/Transaction.js';
import { FamilyService } from './family.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { runInTransaction } from '../utils/transaction.js';

export class LedgerService {
  /**
   * Enforces positive integer currency validation (paise).
   */
  static validatePaise(amount) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new AppError(
        'Amount must be a strictly positive integer in paise (1 INR = 100 paise)',
        400,
        'INVALID_AMOUNT'
      );
    }
  }

  /**
   * Top-up parent wallet (Test mode simulation).
   * Atomically credits parent wallet and logs a LedgerEntry.
   */
  static async topupParentWallet({ parentId, amount, idempotencyKey, metadata = {} }) {
    this.validatePaise(amount);

    if (!idempotencyKey) {
      throw new AppError('Idempotency-Key header is required for financial operations', 400, 'MISSING_IDEMPOTENCY_KEY');
    }

    // 1. Idempotency Check: Return existing record if already executed
    const existingTxn = await Transaction.findOne({ idempotencyKey });
    if (existingTxn) {
      return { transaction: existingTxn, isDuplicate: true };
    }

    try {
      return await runInTransaction(async (session) => {
        const sessionOpt = session ? { session } : {};

        // 2. Fetch parent wallet
        const query = Wallet.findOne({ ownerId: parentId });
        const wallet = session ? await query.session(session) : await query;

        if (!wallet) {
          throw new AppError('Parent wallet not found', 404, 'WALLET_NOT_FOUND');
        }

        if (wallet.type !== 'parent') {
          throw new AppError('Only parent wallets can be topped up directly', 403, 'FORBIDDEN');
        }

        // 3. Increment balance
        wallet.balance += amount;
        await wallet.save(sessionOpt);

        // 4. Record Transaction
        const createTxnOptions = session ? { session } : {};
        const [txn] = await Transaction.create(
          [
            {
              type: 'topup',
              fromWalletId: null,
              toWalletId: wallet._id,
              amount,
              category: 'topup',
              status: 'completed',
              idempotencyKey,
              ruleDecision: { result: 'APPROVE', reason: 'Direct parent topup' },
              metadata,
            },
          ],
          createTxnOptions
        );

        // 5. Append-only credit LedgerEntry
        const createLedgerOptions = session ? { session, ordered: true } : {};
        await LedgerEntry.create(
          [
            {
              walletId: wallet._id,
              direction: 'credit',
              amount,
              balanceAfter: wallet.balance,
              transactionId: txn._id,
            },
          ],
          createLedgerOptions
        );

        return { transaction: txn, isDuplicate: false };
      });
    } catch (error) {
      if (error.code === 11000 && error.keyPattern?.idempotencyKey) {
        const raceTxn = await Transaction.findOne({ idempotencyKey });
        if (raceTxn) return { transaction: raceTxn, isDuplicate: true };
      }
      throw error;
    }
  }

  /**
   * Transfer funds from parent wallet to linked child wallet.
   * Atomically debits parent, credits child, and records two immutable ledger entries.
   */
  static async transferParentToChild({ parentId, childId, amount, idempotencyKey, metadata = {} }) {
    this.validatePaise(amount);

    if (!idempotencyKey) {
      throw new AppError('Idempotency-Key header is required for financial operations', 400, 'MISSING_IDEMPOTENCY_KEY');
    }

    // 1. Verify parent-child active relationship
    await FamilyService.verifyParentChildAccess(parentId, childId);

    // 2. Idempotency Check
    const existingTxn = await Transaction.findOne({ idempotencyKey });
    if (existingTxn) {
      return { transaction: existingTxn, isDuplicate: true };
    }

    try {
      return await runInTransaction(async (session) => {
        const sessionOpt = session ? { session } : {};

        // 3. Fetch both wallets
        const parentQuery = Wallet.findOne({ ownerId: parentId });
        const childQuery = Wallet.findOne({ ownerId: childId });

        const parentWallet = session ? await parentQuery.session(session) : await parentQuery;
        const childWallet = session ? await childQuery.session(session) : await childQuery;

        if (!parentWallet) {
          throw new AppError('Parent wallet not found', 404, 'WALLET_NOT_FOUND');
        }
        if (!childWallet) {
          throw new AppError('Child wallet not found', 404, 'WALLET_NOT_FOUND');
        }

        // 4. Balance check
        if (parentWallet.balance < amount) {
          throw new AppError(
            `Insufficient funds in parent wallet. Current balance: ${parentWallet.balance} paise, required: ${amount} paise.`,
            400,
            'INSUFFICIENT_FUNDS'
          );
        }

        // 5. Update balances
        parentWallet.balance -= amount;
        childWallet.balance += amount;

        await parentWallet.save(sessionOpt);
        await childWallet.save(sessionOpt);

        // 6. Record Transaction
        const createTxnOptions = session ? { session } : {};
        const [txn] = await Transaction.create(
          [
            {
              type: 'transfer',
              fromWalletId: parentWallet._id,
              toWalletId: childWallet._id,
              amount,
              category: 'allowance',
              status: 'completed',
              idempotencyKey,
              ruleDecision: { result: 'APPROVE', reason: 'Parent funded child wallet' },
              metadata,
            },
          ],
          createTxnOptions
        );

        // 7. Write two immutable ledger entries (parent debit, child credit)
        const createLedgerOptions = session ? { session, ordered: true } : {};
        await LedgerEntry.create(
          [
            {
              walletId: parentWallet._id,
              direction: 'debit',
              amount,
              balanceAfter: parentWallet.balance,
              transactionId: txn._id,
            },
            {
              walletId: childWallet._id,
              direction: 'credit',
              amount,
              balanceAfter: childWallet.balance,
              transactionId: txn._id,
            },
          ],
          createLedgerOptions
        );

        return { transaction: txn, isDuplicate: false };
      });
    } catch (error) {
      if (error.code === 11000 && error.keyPattern?.idempotencyKey) {
        const raceTxn = await Transaction.findOne({ idempotencyKey });
        if (raceTxn) return { transaction: raceTxn, isDuplicate: true };
      }
      throw error;
    }
  }

  /**
   * Reconciles current wallet balance with sum of its ledger entries.
   * Proves that balance === sum(credits) - sum(debits).
   */
  static async reconcileWallet(walletId) {
    const wallet = await Wallet.findById(walletId);
    if (!wallet) throw new AppError('Wallet not found', 404, 'WALLET_NOT_FOUND');

    const entries = await LedgerEntry.find({ walletId });
    let calculatedBalance = 0;

    for (const entry of entries) {
      if (entry.direction === 'credit') {
        calculatedBalance += entry.amount;
      } else if (entry.direction === 'debit') {
        calculatedBalance -= entry.amount;
      }
    }

    return {
      walletId,
      storedBalance: wallet.balance,
      reconciledBalance: calculatedBalance,
      isConsistent: wallet.balance === calculatedBalance,
      entryCount: entries.length,
    };
  }
}
