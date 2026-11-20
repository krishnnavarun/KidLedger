import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Get authenticated user's notifications (supports ?unreadOnly=true&page=1&limit=20)
router.get('/', NotificationController.getNotifications);

// Mark all notifications as read for current user
router.patch('/read-all', NotificationController.markAllAsRead);

// Mark a specific notification as read
router.patch('/:id/read', NotificationController.markAsRead);

export default router;
