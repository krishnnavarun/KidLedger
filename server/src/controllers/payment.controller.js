import { PaymentService } from '../services/payment.service.js';

export class PaymentController {
  static async payMerchant(req, res, next) {
    try {
      const childId = req.user.id || req.user._id;
      const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
      const { merchantId, amount, note } = req.body;

      const result = await PaymentService.processPayment({
        childId,
        merchantId,
        amount,
        idempotencyKey,
        note,
      });

      const statusCode = result.status === 'completed' && !result.isDuplicate ? 201 : 200;

      res.status(statusCode).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async approvePayment(req, res, next) {
    try {
      const parentId = req.user.id || req.user._id;
      const { id } = req.params;

      const transaction = await PaymentService.approvePendingPayment({
        parentId,
        transactionId: id,
      });

      res.status(200).json({
        success: true,
        data: {
          transaction,
          message: 'Transaction approved successfully',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async declinePayment(req, res, next) {
    try {
      const parentId = req.user.id || req.user._id;
      const { id } = req.params;
      const { reason } = req.body;

      const transaction = await PaymentService.declinePendingPayment({
        parentId,
        transactionId: id,
        reason,
      });

      res.status(200).json({
        success: true,
        data: {
          transaction,
          message: 'Transaction declined successfully',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async payFriend(req, res, next) {
    try {
      const senderChildId = req.user.id || req.user._id;
      const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
      const { recipientPhone, amount, note } = req.body;

      const result = await PaymentService.payFriendByPhone({
        senderChildId,
        recipientPhone,
        amount,
        idempotencyKey,
        note,
      });

      const statusCode = result.status === 'completed' && !result.isDuplicate ? 201 : 200;

      res.status(statusCode).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async payByScan(req, res, next) {
    try {
      const childId = req.user.id || req.user._id;
      const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
      const { qrCode, amount, note } = req.body;

      const result = await PaymentService.payByScan({
        childId,
        qrCode,
        amount,
        idempotencyKey,
        note,
      });

      const statusCode = result.status === 'completed' && !result.isDuplicate ? 201 : 200;

      res.status(statusCode).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
