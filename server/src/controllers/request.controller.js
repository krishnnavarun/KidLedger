import { RequestService } from '../services/request.service.js';

export class RequestController {
  static async createRequest(req, res, next) {
    try {
      const childId = req.user.id || req.user._id;
      const { amount, reason } = req.body;

      const request = await RequestService.createMoneyRequest({
        childId,
        amount,
        reason,
      });

      res.status(201).json({
        success: true,
        data: {
          request,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getRequests(req, res, next) {
    try {
      const userId = req.user.id || req.user._id;
      const { status, page = 1, limit = 20 } = req.query;

      const result = await RequestService.getRequests(userId, req.user.role, {
        status,
        page,
        limit,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async approveRequest(req, res, next) {
    try {
      const parentId = req.user.id || req.user._id;
      const { id } = req.params;
      const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;

      const result = await RequestService.approveRequest({
        parentId,
        requestId: id,
        idempotencyKey,
      });

      res.status(200).json({
        success: true,
        data: {
          request: result.request,
          transaction: result.transaction,
          message: 'Money request approved and funds transferred',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async declineRequest(req, res, next) {
    try {
      const parentId = req.user.id || req.user._id;
      const { id } = req.params;
      const { reason } = req.body;

      const request = await RequestService.declineRequest({
        parentId,
        requestId: id,
        reason,
      });

      res.status(200).json({
        success: true,
        data: {
          request,
          message: 'Money request declined',
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
