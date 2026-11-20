import { Notification } from '../models/Notification.js';
import { AppError } from '../middleware/errorHandler.js';

export class NotificationService {
  /**
   * Dispatches an in-app notification to a user.
   */
  static async createNotification({ userId, type, title, message, metadata = {} }) {
    return await Notification.create({
      userId,
      type,
      title,
      message,
      metadata,
    });
  }

  /**
   * Retrieves paginated notifications for a user, including total unread count.
   */
  static async getUserNotifications(userId, { unreadOnly = false, page = 1, limit = 20 }) {
    const query = { userId };
    if (unreadOnly) {
      query.readAt = null;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Notification.countDocuments(query),
      Notification.countDocuments({ userId, readAt: null }),
    ]);

    return {
      notifications,
      unreadCount,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    };
  }

  /**
   * Marks a single notification as read.
   */
  static async markAsRead(userId, notificationId) {
    const notification = await Notification.findOne({ _id: notificationId, userId });
    if (!notification) {
      throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await notification.save();
    }

    return notification;
  }

  /**
   * Marks all notifications as read for a user.
   */
  static async markAllAsRead(userId) {
    const result = await Notification.updateMany(
      { userId, readAt: null },
      { $set: { readAt: new Date() } }
    );

    return {
      modifiedCount: result.modifiedCount,
    };
  }
}
