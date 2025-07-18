import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { notificationService } from '../../features/notifications/notification-service';

const router = Router();

// Apply authentication middleware to all notification routes
router.use(requireAuth);

// Get all notifications for the current user
router.get('/users/me/notifications', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const { limit = 50, offset = 0, unreadOnly = false } = req.query;
    
    const notifications = await notificationService.getUserNotifications(
      userId,
      parseInt(limit as string),
      parseInt(offset as string)
    );

    // Filter unread only if requested
    const filteredNotifications = unreadOnly === 'true' 
      ? notifications.filter(n => !n.isRead)
      : notifications;

    res.json({
      success: true,
      data: {
        notifications: filteredNotifications,
        total: notifications.length,
        unreadCount: notifications.filter(n => !n.isRead).length,
      },
      metadata: {
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('[Notifications] Failed to get user notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get notifications',
    });
  }
});

// Mark a notification as read
router.put('/notifications/:notificationId/read', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const { notificationId } = req.params;
    
    await notificationService.markAsRead(notificationId, userId);

    res.json({
      success: true,
      data: {
        notificationId,
        readAt: new Date(),
      },
      metadata: {
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('[Notifications] Failed to mark notification as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read',
    });
  }
});

// Mark all notifications as read for the user
router.put('/users/me/notifications/read-all', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    // Get all unread notifications and mark them as read
    const notifications = await notificationService.getUserNotifications(userId);
    const unreadNotifications = notifications.filter(n => !n.isRead);

    for (const notification of unreadNotifications) {
      await notificationService.markAsRead(notification.id, userId);
    }

    res.json({
      success: true,
      data: {
        markedCount: unreadNotifications.length,
      },
      metadata: {
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('[Notifications] Failed to mark all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
    });
  }
});

// Get user notification settings
router.get('/users/me/notification-settings', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const settings = await notificationService.getUserNotificationSettings(userId);

    res.json({
      success: true,
      data: settings,
      metadata: {
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('[Notifications] Failed to get notification settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get notification settings',
    });
  }
});

// Update user notification settings
router.put('/users/me/notification-settings', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const settings = req.body;
    
    // Validate settings
    const allowedFields = [
      'emailNotifications',
      'pushNotifications', 
      'smsNotifications',
      'tripUpdates',
      'budgetAlerts',
      'chatMessages',
      'voteRequests',
      'quietHours',
    ];

    const filteredSettings: any = {};
    for (const field of allowedFields) {
      if (settings[field] !== undefined) {
        filteredSettings[field] = settings[field];
      }
    }

    const updatedSettings = await notificationService.updateUserNotificationSettings(
      userId,
      filteredSettings
    );

    res.json({
      success: true,
      data: updatedSettings,
      metadata: {
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('[Notifications] Failed to update notification settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification settings',
    });
  }
});

// Create a test notification (development only)
router.post('/notifications/test', async (req: any, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Test endpoint not available in production',
    });
  }

  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const { title = 'Test Notification', message = 'This is a test notification', type = 'info', data } = req.body;

    const notification = await notificationService.createNotification({
      userId,
      title,
      message,
      type,
      data,
      channels: ['websocket', 'push'],
    });

    res.json({
      success: true,
      data: notification,
      metadata: {
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('[Notifications] Failed to create test notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create test notification',
    });
  }
});

// Get notification statistics
router.get('/users/me/notification-stats', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const notifications = await notificationService.getUserNotifications(userId);
    
    const stats = {
      total: notifications.length,
      unread: notifications.filter(n => !n.isRead).length,
      byType: notifications.reduce((acc: any, n) => {
        acc[n.type] = (acc[n.type] || 0) + 1;
        return acc;
      }, {}),
      recentCount: notifications.filter(n => {
        const dayAgo = new Date();
        dayAgo.setDate(dayAgo.getDate() - 1);
        return n.createdAt > dayAgo;
      }).length,
    };

    res.json({
      success: true,
      data: stats,
      metadata: {
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('[Notifications] Failed to get notification stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get notification stats',
    });
  }
});

export default router;
