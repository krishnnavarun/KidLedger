import { NotificationService } from '../services/notification.service.js';

export class NotificationController {
  static async getNotifications(req, res, next) {
    try {
      const userId = req.user.id || req.user._id;
      const { unreadOnly, page = 1, limit = 20 } = req.query;

      const result = await NotificationService.getUserNotifications(userId, {
        unreadOnly: unreadOnly === 'true',
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

  static async markAsRead(req, res, next) {
    try {
      const userId = req.user.id || req.user._id;
      const { id } = req.params;

      const notification = await NotificationService.markAsRead(userId, id);

      res.status(200).json({
        success: true,
        data: {
          notification,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async markAllAsRead(req, res, next) {
    try {
      const userId = req.user.id || req.user._id;
      const result = await NotificationService.markAllAsRead(userId);

      res.status(200).json({
        success: true,
        data: {
          message: 'All notifications marked as read',
          modifiedCount: result.modifiedCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
