import { User } from '../models/User.js';
import { Wallet } from '../models/Wallet.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { Transaction } from '../models/Transaction.js';
import { Merchant } from '../models/Merchant.js';
import { Rule } from '../models/Rule.js';
import { FamilyLink } from '../models/FamilyLink.js';
import { FamilyService } from './family.service.js';
import { NotificationService } from './notification.service.js';
import { evaluateRules } from '../rules/ruleEngine.js';
import { LedgerService } from './ledger.service.js';
import { runInTransaction } from '../utils/transaction.js';
import { parseQRCode } from '../utils/qrParser.js';
import { AppError } from '../middleware/errorHandler.js';

export class PaymentService {
  /**
   * Computes aggregate historical spend for a wallet across today, this week, and this month.
   */
  static async calculateHistoricalSpend(walletId) {
    const now = new Date();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const completedPayments = await Transaction.find({
      fromWalletId: walletId,
      status: 'completed',
      type: 'payment',
      createdAt: { $gte: startOfMonth < startOfWeek ? startOfMonth : startOfWeek },
    });

    let today = 0;
    let thisWeek = 0;
    let thisMonth = 0;

    for (const txn of completedPayments) {
      const txnTime = new Date(txn.createdAt).getTime();
      if (txnTime >= startOfToday.getTime()) today += txn.amount;
      if (txnTime >= startOfWeek.getTime()) thisWeek += txn.amount;
      if (txnTime >= startOfMonth.getTime()) thisMonth += txn.amount;
    }

    return { today, thisWeek, thisMonth };
  }

  /**
   * Child initiates payment to a simulated merchant.
   * Evaluates rules deterministically and acts accordingly (APPROVE, BLOCK, NEEDS_APPROVAL).
   */
  static async processPayment({ childId, merchantId, amount, idempotencyKey, note }) {
    LedgerService.validatePaise(amount);

    if (!idempotencyKey) {
      throw new AppError('Idempotency-Key header is required for payments', 400, 'MISSING_IDEMPOTENCY_KEY');
    }

    // 1. Idempotency Check
    const existingTxn = await Transaction.findOne({ idempotencyKey });
    if (existingTxn) {
      return { transaction: existingTxn, isDuplicate: true };
    }

    // 2. Fetch Child Wallet
    const childWallet = await Wallet.findOne({ ownerId: childId });
    if (!childWallet) {
      throw new AppError('Child wallet not found', 404, 'WALLET_NOT_FOUND');
    }

    // 3. Balance pre-check: Cannot spend more than available balance
    if (childWallet.balance < amount) {
      throw new AppError(
        `Insufficient wallet balance. Balance: ₹${(childWallet.balance / 100).toFixed(2)}, Required: ₹${(amount / 100).toFixed(2)}`,
        400,
        'INSUFFICIENT_FUNDS'
      );
    }

    // 4. Fetch Merchant
    const merchant = await Merchant.findById(merchantId);
    if (!merchant || !merchant.isActive) {
      throw new AppError('Merchant not found or inactive', 404, 'MERCHANT_NOT_FOUND');
    }

    // 5. Fetch Active Parental Rules & Calculate Historical Spend
    const rules = await Rule.find({ childId, active: true });
    const historicalSpend = await this.calculateHistoricalSpend(childWallet._id);

    // 6. Execute Pure Rule Engine
    const evaluation = evaluateRules({
      transaction: {
        amount,
        category: merchant.category,
        merchantId: merchant._id.toString(),
      },
      rules,
      historicalSpend,
    });

    // 7. Handle Outcomes based on Rule Decision:

    // --- CASE A: BLOCKED ---
    if (evaluation.decision === 'BLOCK') {
      const txn = await Transaction.create({
        type: 'payment',
        fromWalletId: childWallet._id,
        merchantId: merchant._id,
        amount,
        category: merchant.category,
        status: 'declined',
        idempotencyKey,
        ruleDecision: {
          result: 'BLOCK',
          reason: evaluation.reason,
        },
        metadata: { note, merchantName: merchant.name },
      });

      return {
        decision: 'BLOCK',
        status: 'declined',
        reason: evaluation.reason,
        transaction: txn,
        isDuplicate: false,
      };
    }

    // --- CASE B: NEEDS PARENT APPROVAL ---
    if (evaluation.decision === 'NEEDS_APPROVAL') {
      const txn = await Transaction.create({
        type: 'payment',
        fromWalletId: childWallet._id,
        merchantId: merchant._id,
        amount,
        category: merchant.category,
        status: 'pending',
        idempotencyKey,
        ruleDecision: {
          result: 'NEEDS_APPROVAL',
          reason: evaluation.reason,
        },
        metadata: { note, merchantName: merchant.name },
      });

      // Notify parent if linked
      const link = await FamilyLink.findOne({ childId, status: 'active' });
      if (link) {
        const childUser = await User.findById(childId);
        await NotificationService.createNotification({
          userId: link.parentId,
          type: 'payment_pending',
          title: 'Payment Requires Approval',
          message: `${childUser?.name || 'Child'} wants to pay ₹${(amount / 100).toFixed(2)} at ${merchant.name}. Reason: ${evaluation.reason}`,
          metadata: {
            transactionId: txn._id,
            childId,
            merchantId: merchant._id,
            merchantName: merchant.name,
            amount,
          },
        });
      }

      return {
        decision: 'NEEDS_APPROVAL',
        status: 'pending',
        reason: evaluation.reason,
        transaction: txn,
        isDuplicate: false,
      };
    }

    // --- CASE C: APPROVED (Deduct money atomically) ---
    return await runInTransaction(async (session) => {
      const sessionOpt = session ? { session } : {};

      const walletQuery = Wallet.findById(childWallet._id);
      const lockedWallet = session ? await walletQuery.session(session) : await walletQuery;

      if (lockedWallet.balance < amount) {
        throw new AppError('Insufficient wallet balance', 400, 'INSUFFICIENT_FUNDS');
      }

      lockedWallet.balance -= amount;
      await lockedWallet.save(sessionOpt);

      const createTxnOptions = session ? { session } : {};
      const [txn] = await Transaction.create(
        [
          {
            type: 'payment',
            fromWalletId: lockedWallet._id,
            merchantId: merchant._id,
            amount,
            category: merchant.category,
            status: 'completed',
            idempotencyKey,
            ruleDecision: {
              result: 'APPROVE',
              reason: evaluation.reason,
            },
            metadata: { note, merchantName: merchant.name },
          },
        ],
        createTxnOptions
      );

      const createLedgerOptions = session ? { session, ordered: true } : {};
      await LedgerEntry.create(
        [
          {
            walletId: lockedWallet._id,
            direction: 'debit',
            amount,
            balanceAfter: lockedWallet.balance,
            transactionId: txn._id,
          },
        ],
        createLedgerOptions
      );

      return {
        decision: 'APPROVE',
        status: 'completed',
        reason: evaluation.reason,
        transaction: txn,
        isDuplicate: false,
      };
    });
  }

  /**
   * Parent approves a pending transaction.
   * Atomically debits the child wallet and marks status completed.
   */
  static async approvePendingPayment({ parentId, transactionId }) {
    const txn = await Transaction.findById(transactionId);
    if (!txn) throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
    if (txn.status !== 'pending') {
      throw new AppError(`Transaction is not pending approval (Current: ${txn.status})`, 400, 'INVALID_TXN_STATUS');
    }

    const childWallet = await Wallet.findById(txn.fromWalletId);
    if (!childWallet) throw new AppError('Child wallet not found', 404, 'WALLET_NOT_FOUND');

    // Verify parent custody
    await FamilyService.verifyParentChildAccess(parentId, childWallet.ownerId);

    return await runInTransaction(async (session) => {
      const sessionOpt = session ? { session } : {};

      const walletQuery = Wallet.findById(childWallet._id);
      const lockedWallet = session ? await walletQuery.session(session) : await walletQuery;

      if (lockedWallet.balance < txn.amount) {
        throw new AppError('Insufficient child wallet balance to complete approved payment', 400, 'INSUFFICIENT_FUNDS');
      }

      lockedWallet.balance -= txn.amount;
      await lockedWallet.save(sessionOpt);

      txn.status = 'completed';
      txn.ruleDecision = {
        result: 'APPROVE',
        reason: 'Parent manually approved transaction',
      };
      await txn.save(sessionOpt);

      const createLedgerOptions = session ? { session, ordered: true } : {};
      await LedgerEntry.create(
        [
          {
            walletId: lockedWallet._id,
            direction: 'debit',
            amount: txn.amount,
            balanceAfter: lockedWallet.balance,
            transactionId: txn._id,
          },
        ],
        createLedgerOptions
      );

      // Notify child that payment was approved
      await NotificationService.createNotification({
        userId: childWallet.ownerId,
        type: 'request_approved',
        title: 'Payment Approved! 🎉',
        message: `Your payment of ₹${(txn.amount / 100).toFixed(2)} was approved by your parent.`,
        metadata: { transactionId: txn._id, amount: txn.amount },
      });

      return txn;
    });
  }

  /**
   * Parent declines a pending transaction.
   */
  static async declinePendingPayment({ parentId, transactionId, reason }) {
    const txn = await Transaction.findById(transactionId);
    if (!txn) throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
    if (txn.status !== 'pending') {
      throw new AppError(`Transaction is not pending approval (Current: ${txn.status})`, 400, 'INVALID_TXN_STATUS');
    }

    const childWallet = await Wallet.findById(txn.fromWalletId);
    if (!childWallet) throw new AppError('Child wallet not found', 404, 'WALLET_NOT_FOUND');

    // Verify parent custody
    await FamilyService.verifyParentChildAccess(parentId, childWallet.ownerId);

    txn.status = 'declined';
    txn.ruleDecision = {
      result: 'BLOCK',
      reason: reason || 'Parent manually declined transaction',
    };
    await txn.save();

    // Notify child that payment was declined
    await NotificationService.createNotification({
      userId: childWallet.ownerId,
      type: 'request_declined',
      title: 'Payment Declined',
      message: `Your payment of ₹${(txn.amount / 100).toFixed(2)} was declined by your parent. Reason: ${txn.ruleDecision.reason}`,
      metadata: { transactionId: txn._id, amount: txn.amount },
    });

    return txn;
  }

  /**
   * Child sends money to a friend's mobile number.
   * Enforces the max ₹300/day (30,000 paise) limit for peer-to-peer transfers.
   */
  static async payFriendByPhone({ senderChildId, recipientPhone, amount, idempotencyKey, note }) {
    LedgerService.validatePaise(amount);

    if (!idempotencyKey) {
      throw new AppError('Idempotency-Key header is required for friend transfers', 400, 'MISSING_IDEMPOTENCY_KEY');
    }

    // 1. Idempotency Check
    const existingTxn = await Transaction.findOne({ idempotencyKey });
    if (existingTxn) {
      return { transaction: existingTxn, isDuplicate: true };
    }

    // 2. Fetch Sender Child Wallet
    const senderWallet = await Wallet.findOne({ ownerId: senderChildId });
    if (!senderWallet) {
      throw new AppError('Sender wallet not found', 404, 'WALLET_NOT_FOUND');
    }

    if (senderWallet.balance < amount) {
      throw new AppError(
        `Insufficient wallet balance. Available: ₹${(senderWallet.balance / 100).toFixed(2)}, Required: ₹${(amount / 100).toFixed(2)}`,
        400,
        'INSUFFICIENT_FUNDS'
      );
    }

    // 3. Find Recipient by Mobile Number
    const recipient = await User.findOne({ phoneNumber: recipientPhone, role: 'child' });
    if (!recipient) {
      throw new AppError(
        `No registered child account found with mobile number '${recipientPhone}'`,
        404,
        'RECIPIENT_NOT_FOUND'
      );
    }

    if (recipient._id.toString() === senderChildId.toString()) {
      throw new AppError('You cannot transfer money to your own mobile number', 400, 'SELF_TRANSFER_FORBIDDEN');
    }

    const recipientWallet = await Wallet.findOne({ ownerId: recipient._id });
    if (!recipientWallet) {
      throw new AppError('Recipient wallet not found', 404, 'RECIPIENT_WALLET_NOT_FOUND');
    }

    // 4. Calculate Sender's Peer-to-Peer Spend Today
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayPeerTxns = await Transaction.find({
      fromWalletId: senderWallet._id,
      type: 'peer_transfer',
      status: 'completed',
      createdAt: { $gte: startOfToday },
    });

    const spentTodayOnFriends = todayPeerTxns.reduce((sum, txn) => sum + txn.amount, 0);

    // 5. Check Parental P2P Rule (Default: Max ₹300/day = 30,000 paise)
    const customRule = await Rule.findOne({
      childId: senderChildId,
      type: 'p2p_daily_limit',
      active: true,
    });

    const p2pDailyLimit = customRule ? Number(customRule.value) : 30000; // 30,000 paise = ₹300.00
    const actionOnViolation = customRule?.actionOnViolation || 'BLOCK';

    if (spentTodayOnFriends + amount > p2pDailyLimit) {
      const reason = `Daily friend transfer limit of ₹${(p2pDailyLimit / 100).toFixed(2)} exceeded (Already sent today: ₹${(spentTodayOnFriends / 100).toFixed(2)}, Attempted: ₹${(amount / 100).toFixed(2)})`;

      if (actionOnViolation === 'NEEDS_APPROVAL') {
        const txn = await Transaction.create({
          type: 'peer_transfer',
          fromWalletId: senderWallet._id,
          toWalletId: recipientWallet._id,
          amount,
          category: 'peer_transfer',
          status: 'pending',
          idempotencyKey,
          ruleDecision: {
            result: 'NEEDS_APPROVAL',
            reason,
          },
          metadata: { recipientPhone, recipientName: recipient.name, note },
        });

        return {
          status: 'pending',
          decision: 'NEEDS_APPROVAL',
          reason,
          transaction: txn,
          isDuplicate: false,
        };
      } else {
        const txn = await Transaction.create({
          type: 'peer_transfer',
          fromWalletId: senderWallet._id,
          toWalletId: recipientWallet._id,
          amount,
          category: 'peer_transfer',
          status: 'declined',
          idempotencyKey,
          ruleDecision: {
            result: 'BLOCK',
            reason,
          },
          metadata: { recipientPhone, recipientName: recipient.name, note },
        });

        return {
          status: 'declined',
          decision: 'BLOCK',
          reason,
          transaction: txn,
          isDuplicate: false,
        };
      }
    }

    // 6. Within Limit -> Execute Atomic Peer Transfer
    return await runInTransaction(async (session) => {
      const sessionOpt = session ? { session } : {};

      const senderLocked = session
        ? await Wallet.findById(senderWallet._id).session(session)
        : await Wallet.findById(senderWallet._id);
      const recipientLocked = session
        ? await Wallet.findById(recipientWallet._id).session(session)
        : await Wallet.findById(recipientWallet._id);

      if (senderLocked.balance < amount) {
        throw new AppError('Insufficient wallet balance', 400, 'INSUFFICIENT_FUNDS');
      }

      senderLocked.balance -= amount;
      recipientLocked.balance += amount;

      await senderLocked.save(sessionOpt);
      await recipientLocked.save(sessionOpt);

      const createTxnOptions = session ? { session } : {};
      const [txn] = await Transaction.create(
        [
          {
            type: 'peer_transfer',
            fromWalletId: senderLocked._id,
            toWalletId: recipientLocked._id,
            amount,
            category: 'peer_transfer',
            status: 'completed',
            idempotencyKey,
            ruleDecision: {
              result: 'APPROVE',
              reason: `Friend transfer within daily limit of ₹${(p2pDailyLimit / 100).toFixed(2)}`,
            },
            metadata: { recipientPhone, recipientName: recipient.name, note },
          },
        ],
        createTxnOptions
      );

      const createLedgerOptions = session ? { session, ordered: true } : {};
      await LedgerEntry.create(
        [
          {
            walletId: senderLocked._id,
            direction: 'debit',
            amount,
            balanceAfter: senderLocked.balance,
            transactionId: txn._id,
          },
          {
            walletId: recipientLocked._id,
            direction: 'credit',
            amount,
            balanceAfter: recipientLocked.balance,
            transactionId: txn._id,
          },
        ],
        createLedgerOptions
      );

      // Notify recipient
      await NotificationService.createNotification({
        userId: recipient._id,
        type: 'transfer_received',
        title: 'Money Received! 💸',
        message: `You received ₹${(amount / 100).toFixed(2)} from a friend!`,
        metadata: {
          transactionId: txn._id,
          senderChildId,
          amount,
          note,
        },
      });

      return {
        status: 'completed',
        decision: 'APPROVE',
        reason: 'Friend transfer completed successfully',
        transaction: txn,
        isDuplicate: false,
      };
    });
  }

  /**
   * Child scans a shop QR code (parses payload and executes payment).
   */
  static async payByScan({ childId, qrCode, amount, idempotencyKey, note }) {
    const parsed = parseQRCode(qrCode);
    const finalAmount = amount || parsed.amount;

    if (!finalAmount) {
      throw new AppError('Payment amount is required (neither in QR code nor request body)', 400, 'MISSING_AMOUNT');
    }

    return await this.processPayment({
      childId,
      merchantId: parsed.merchantId,
      amount: finalAmount,
      idempotencyKey,
      note: note || parsed.note,
    });
  }
}
