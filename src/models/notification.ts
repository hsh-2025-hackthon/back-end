export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'trip_update' | 'budget_alert' | 'chat_message' | 'vote_request';
  data?: Record<string, any>;
  isRead: boolean;
  createdAt: Date;
  readAt?: Date;
  expiresAt?: Date;
  scheduledFor?: Date;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  type: Notification['type'];
  title: string;
  message: string;
  variables: string[];
  channels: NotificationChannel[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserNotificationSettings {
  userId: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  tripUpdates: boolean;
  budgetAlerts: boolean;
  chatMessages: boolean;
  voteRequests: boolean;
  quietHours: {
    enabled: boolean;
    startTime: string; // HH:MM format
    endTime: string; // HH:MM format
    timezone: string;
  };
  updatedAt: Date;
}

export type NotificationChannel = 'push' | 'email' | 'sms' | 'websocket';

export interface NotificationDelivery {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  recipient: string; // email, phone, or device token
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';
  attemptCount: number;
  sentAt?: Date;
  deliveredAt?: Date;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface CreateNotificationRequest {
  userId: string;
  title: string;
  message: string;
  type: Notification['type'];
  data?: Record<string, any>;
  channels?: NotificationChannel[];
  scheduledFor?: Date;
  expiresAt?: Date;
}

export interface ScheduledNotification {
  id: string;
  notificationId: string;
  scheduledFor: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  attemptCount: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}
