import { MoneyRequest } from '../models/MoneyRequest.js';
import { FamilyLink } from '../models/FamilyLink.js';
import { User } from '../models/User.js';
import { LedgerService } from './ledger.service.js';
import { NotificationService } from './notification.service.js';
import { AppError } from '../middleware/errorHandler.js';

export class RequestService {
  /**
   * Child creates a request for money with an explanation.
   * Automatically notifies the linked parent.
   */
  static async createRequest({ childId, amount, reason }) {
    LedgerService.validatePaise(amount);

    // 1. Locate active parent link
    const link = await FamilyLink.findOne({ childId, status: 'active' });
    if (!link) {
      throw new AppError('Child does not have an active linked parent to request money from', 400, 'NO_LINKED_PARENT');
    }

    const child = await User.findById(childId);
    if (!child) throw new AppError('Child user not found', 404, 'USER_NOT_FOUND');

    // 2. Create the MoneyRequest
    const request = await MoneyRequest.create({
      childId,
      parentId: link.parentId,
      amount,
      reason,
      status: 'pending',
    });

    // 3. Notify Parent
    await NotificationService.createNotification({
      userId: link.parentId,
      type: 'money_request',
      title: 'New Money Request',
      message: `${child.name} requested ₹${(amount / 100).toFixed(2)} for: "${reason}"`,
      metadata: {
        requestId: request._id,
        childId,
        childName: child.name,
        amount,
      },
    });

    return request;
  }

  static async createMoneyRequest(args) {
    return this.createRequest(args);
  }

  /**
   * Retrieves requests for a user (Parent views incoming; Child views outgoing).
   */
  static async getRequests(userId, role, { status, page = 1, limit = 20 }) {
    const query = role === 'parent' ? { parentId: userId } : { childId: userId };
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const populateField = role === 'parent' ? 'childId' : 'parentId';

    const [requests, total] = await Promise.all([
      MoneyRequest.find(query)
        .populate(populateField, 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      MoneyRequest.countDocuments(query),
    ]);

    return {
      requests,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    };
  }

  /**
   * Parent approves a money request.
   * Triggers an atomic wallet transfer and deposits funds into child wallet.
   */
  static async approveRequest({ parentId, requestId, idempotencyKey }) {
    const request = await MoneyRequest.findOne({ _id: requestId, parentId });
    if (!request) {
      throw new AppError('Money request not found or unauthorized', 404, 'REQUEST_NOT_FOUND');
    }

    if (request.status !== 'pending') {
      throw new AppError(
        `Request cannot be approved because it is already '${request.status}'`,
        400,
        'INVALID_REQUEST_STATUS'
      );
    }

    const key = idempotencyKey || `req-approve-${request._id.toString()}`;

    // 1. Execute wallet transfer (Parent -> Child) via LedgerService
    const transferResult = await LedgerService.transferParentToChild({
      parentId,
      childId: request.childId,
      amount: request.amount,
      idempotencyKey: key,
      metadata: {
        requestId: request._id,
        reason: request.reason,
      },
    });

    // 2. Mark request as approved
    request.status = 'approved';
    request.decidedAt = new Date();
    request.transactionId = transferResult.transaction._id || transferResult.transaction.id;
    await request.save();

    // 3. Notify Child
    await NotificationService.createNotification({
      userId: request.childId,
      type: 'request_approved',
      title: 'Money Request Approved! 🎉',
      message: `Your parent approved your request for ₹${(request.amount / 100).toFixed(2)} (${request.reason})!`,
      metadata: {
        requestId: request._id,
        amount: request.amount,
        transactionId: request.transactionId,
      },
    });

    return {
      request,
      transaction: transferResult.transaction,
    };
  }

  /**
   * Parent declines a money request.
   */
  static async declineRequest({ parentId, requestId, reason }) {
    const request = await MoneyRequest.findOne({ _id: requestId, parentId });
    if (!request) {
      throw new AppError('Money request not found or unauthorized', 404, 'REQUEST_NOT_FOUND');
    }

    if (request.status !== 'pending') {
      throw new AppError(
        `Request cannot be declined because it is already '${request.status}'`,
        400,
        'INVALID_REQUEST_STATUS'
      );
    }

    // 1. Mark request as declined
    request.status = 'declined';
    request.decidedAt = new Date();
    request.decisionReason = reason || 'Declined by parent';
    await request.save();

    // 2. Notify Child
    await NotificationService.createNotification({
      userId: request.childId,
      type: 'request_declined',
      title: 'Money Request Declined',
      message: `Your request for ₹${(request.amount / 100).toFixed(2)} was declined. Reason: "${request.decisionReason}"`,
      metadata: {
        requestId: request._id,
        reason: request.decisionReason,
      },
    });

    return request;
  }
}
