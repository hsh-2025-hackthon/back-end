import { 
  Notification, 
  CreateNotificationRequest, 
  NotificationDelivery, 
  UserNotificationSettings,
  NotificationChannel,
  ScheduledNotification 
} from '../../models/notification';
import { PushNotificationService } from './push-notification-service';
import { EmailService } from './email-service';
import { WebSocketService } from './websocket-service';

export class NotificationService {
  private pushService: PushNotificationService;
  private emailService: EmailService;
  private webSocketService: WebSocketService;
  private scheduledNotifications: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.pushService = new PushNotificationService();
    this.emailService = new EmailService();
    this.webSocketService = new WebSocketService();
    this.startSchedulerCleanup();
  }

  async createNotification(request: CreateNotificationRequest): Promise<Notification> {
    const notification: Notification = {
      id: this.generateId(),
      userId: request.userId,
      title: request.title,
      message: request.message,
      type: request.type,
      data: request.data,
      isRead: false,
      createdAt: new Date(),
      scheduledFor: request.scheduledFor,
      expiresAt: request.expiresAt,
    };

    try {
      // Store notification in database
      await this.saveNotification(notification);

      // If scheduled for future, schedule it
      if (request.scheduledFor && request.scheduledFor > new Date()) {
        await this.scheduleNotification(notification, request.channels);
      } else {
        // Send immediately
        await this.sendNotification(notification, request.channels);
      }

      return notification;
    } catch (error) {
      console.error('[NotificationService] Failed to create notification:', error);
      throw error;
    }
  }

  async sendNotification(notification: Notification, channels?: NotificationChannel[]): Promise<void> {
    try {
      // Get user notification settings
      const userSettings = await this.getUserNotificationSettings(notification.userId);
      
      // Check if user is in quiet hours
      if (this.isInQuietHours(userSettings)) {
        console.log('[NotificationService] User in quiet hours, skipping notification');
        return;
      }

      // Determine which channels to use
      const targetChannels = this.getTargetChannels(notification, userSettings, channels);
      
      // Send to each channel
      const deliveryPromises = targetChannels.map(channel => 
        this.sendToChannel(notification, channel, userSettings)
      );

      await Promise.allSettled(deliveryPromises);
      
      console.log(`[NotificationService] Notification sent to ${targetChannels.length} channels`);
    } catch (error) {
      console.error('[NotificationService] Failed to send notification:', error);
      throw error;
    }
  }

  private async sendToChannel(
    notification: Notification, 
    channel: NotificationChannel, 
    userSettings: UserNotificationSettings
  ): Promise<NotificationDelivery> {
    const delivery: NotificationDelivery = {
      id: this.generateId(),
      notificationId: notification.id,
      channel,
      recipient: '', // Will be set based on channel
      status: 'pending',
      attemptCount: 0,
      metadata: {},
    };

    try {
      delivery.attemptCount++;

      switch (channel) {
        case 'push':
          if (userSettings.pushNotifications) {
            delivery.recipient = await this.getUserDeviceToken(notification.userId);
            await this.pushService.sendPushNotification(delivery.recipient, {
              title: notification.title,
              body: notification.message,
              data: notification.data,
            });
          }
          break;

        case 'email':
          if (userSettings.emailNotifications) {
            delivery.recipient = await this.getUserEmail(notification.userId);
            await this.emailService.sendEmail({
              to: delivery.recipient,
              subject: notification.title,
              html: this.formatEmailNotification(notification),
              data: notification.data,
            });
          }
          break;

        case 'websocket':
          try {
            await this.webSocketService.sendToUser(notification.userId, 'notification', {
              notification,
              timestamp: new Date(),
            });
            delivery.recipient = notification.userId;
          } catch (error) {
            // WebSocket might not be connected, don't fail the entire notification
            console.warn('[NotificationService] WebSocket delivery failed:', error);
          }
          break;

        case 'sms':
          if (userSettings.smsNotifications) {
            delivery.recipient = await this.getUserPhone(notification.userId);
            // SMS implementation would go here
            console.log('[NotificationService] SMS not implemented yet');
          }
          break;
      }

      delivery.status = 'sent';
      delivery.sentAt = new Date();
      
      // In a real implementation, you'd check for delivery confirmation
      delivery.status = 'delivered';
      delivery.deliveredAt = new Date();

    } catch (error) {
      delivery.status = 'failed';
      delivery.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[NotificationService] Channel ${channel} delivery failed:`, error);
    }

    // Save delivery record
    await this.saveDelivery(delivery);
    return delivery;
  }

  private getTargetChannels(
    notification: Notification, 
    userSettings: UserNotificationSettings, 
    requestedChannels?: NotificationChannel[]
  ): NotificationChannel[] {
    // Default channels based on notification type
    const defaultChannels: NotificationChannel[] = ['websocket'];
    
    // Add push and email for important notifications
    if (['error', 'budget_alert', 'vote_request'].includes(notification.type)) {
      defaultChannels.push('push');
      if (notification.type === 'budget_alert') {
        defaultChannels.push('email');
      }
    }

    // Filter by user preferences and type settings
    const allowedChannels = defaultChannels.filter(channel => {
      switch (channel) {
        case 'push':
          return userSettings.pushNotifications && this.isNotificationTypeEnabled(notification.type, userSettings);
        case 'email':
          return userSettings.emailNotifications && this.isNotificationTypeEnabled(notification.type, userSettings);
        case 'sms':
          return userSettings.smsNotifications && this.isNotificationTypeEnabled(notification.type, userSettings);
        case 'websocket':
          return true; // Always try websocket
        default:
          return false;
      }
    });

    // Override with requested channels if provided
    return requestedChannels ? 
      requestedChannels.filter(channel => allowedChannels.includes(channel)) : 
      allowedChannels;
  }

  private isNotificationTypeEnabled(type: Notification['type'], settings: UserNotificationSettings): boolean {
    switch (type) {
      case 'trip_update':
        return settings.tripUpdates;
      case 'budget_alert':
        return settings.budgetAlerts;
      case 'chat_message':
        return settings.chatMessages;
      case 'vote_request':
        return settings.voteRequests;
      default:
        return true; // Enable other types by default
    }
  }

  private isInQuietHours(settings: UserNotificationSettings): boolean {
    if (!settings.quietHours.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: settings.quietHours.timezone 
    });

    const start = settings.quietHours.startTime;
    const end = settings.quietHours.endTime;

    if (start <= end) {
      return currentTime >= start && currentTime <= end;
    } else {
      // Quiet hours span midnight
      return currentTime >= start || currentTime <= end;
    }
  }

  async scheduleNotification(notification: Notification, channels?: NotificationChannel[]): Promise<void> {
    if (!notification.scheduledFor) {
      throw new Error('Notification must have scheduledFor date');
    }

    const delay = notification.scheduledFor.getTime() - Date.now();
    
    if (delay <= 0) {
      // Past date, send immediately
      await this.sendNotification(notification, channels);
      return;
    }

    // Schedule for future
    const timeoutId = setTimeout(async () => {
      try {
        await this.sendNotification(notification, channels);
        this.scheduledNotifications.delete(notification.id);
      } catch (error) {
        console.error('[NotificationService] Scheduled notification failed:', error);
      }
    }, delay);

    this.scheduledNotifications.set(notification.id, timeoutId);
    
    console.log(`[NotificationService] Notification scheduled for ${notification.scheduledFor}`);
  }

  async cancelScheduledNotification(notificationId: string): Promise<void> {
    const timeoutId = this.scheduledNotifications.get(notificationId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.scheduledNotifications.delete(notificationId);
      console.log(`[NotificationService] Cancelled scheduled notification: ${notificationId}`);
    }
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      // Update notification in database
      await this.updateNotificationReadStatus(notificationId, userId, true);
      
      // Notify via websocket
      await this.webSocketService.sendToUser(userId, 'notification_read', {
        notificationId,
        timestamp: new Date(),
      });
      
      console.log(`[NotificationService] Notification marked as read: ${notificationId}`);
    } catch (error) {
      console.error('[NotificationService] Failed to mark notification as read:', error);
      throw error;
    }
  }

  async getUserNotifications(userId: string, limit: number = 50, offset: number = 0): Promise<Notification[]> {
    // Implementation would query database
    // For now, return empty array
    return [];
  }

  async getUserNotificationSettings(userId: string): Promise<UserNotificationSettings> {
    // Implementation would query database
    // For now, return default settings
    return {
      userId,
      emailNotifications: true,
      pushNotifications: true,
      smsNotifications: false,
      tripUpdates: true,
      budgetAlerts: true,
      chatMessages: true,
      voteRequests: true,
      quietHours: {
        enabled: false,
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'UTC',
      },
      updatedAt: new Date(),
    };
  }

  async updateUserNotificationSettings(userId: string, settings: Partial<UserNotificationSettings>): Promise<UserNotificationSettings> {
    // Implementation would update database
    const currentSettings = await this.getUserNotificationSettings(userId);
    const updatedSettings = { ...currentSettings, ...settings, updatedAt: new Date() };
    
    console.log(`[NotificationService] Updated notification settings for user: ${userId}`);
    return updatedSettings;
  }

  private formatEmailNotification(notification: Notification): string {
    return `
      <html>
        <body>
          <h2>${notification.title}</h2>
          <p>${notification.message}</p>
          ${notification.data ? `<p><strong>Additional Data:</strong> ${JSON.stringify(notification.data, null, 2)}</p>` : ''}
          <p><em>Sent at ${notification.createdAt}</em></p>
        </body>
      </html>
    `;
  }

  private startSchedulerCleanup(): void {
    // Clean up expired notifications every hour
    setInterval(() => {
      this.cleanupExpiredNotifications();
    }, 60 * 60 * 1000);
  }

  private async cleanupExpiredNotifications(): Promise<void> {
    // Implementation would clean up expired notifications from database
    console.log('[NotificationService] Cleaning up expired notifications');
  }

  private generateId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Database operations (to be implemented with actual DB)
  private async saveNotification(notification: Notification): Promise<void> {
    // Implementation would save to database
    console.log('[NotificationService] Saving notification:', notification.id);
  }

  private async saveDelivery(delivery: NotificationDelivery): Promise<void> {
    // Implementation would save to database
    console.log('[NotificationService] Saving delivery record:', delivery.id);
  }

  private async updateNotificationReadStatus(notificationId: string, userId: string, isRead: boolean): Promise<void> {
    // Implementation would update database
    console.log('[NotificationService] Updating read status:', { notificationId, userId, isRead });
  }

  private async getUserDeviceToken(userId: string): Promise<string> {
    // Implementation would get device token from database
    return `device_token_${userId}`;
  }

  private async getUserEmail(userId: string): Promise<string> {
    // Implementation would get email from database
    return `user${userId}@example.com`;
  }

  private async getUserPhone(userId: string): Promise<string> {
    // Implementation would get phone from database
    return `+1234567890`;
  }

  async shutdown(): Promise<void> {
    // Clear all scheduled notifications
    for (const timeoutId of this.scheduledNotifications.values()) {
      clearTimeout(timeoutId);
    }
    this.scheduledNotifications.clear();
    
    console.log('[NotificationService] Shutdown completed');
  }
}

// Singleton instance
export const notificationService = new NotificationService();
