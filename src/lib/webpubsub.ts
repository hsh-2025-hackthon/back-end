import { getRedisPublisher } from './redis';
import { randomBytes } from 'crypto';

// Mock WebSocket token interface for compatibility
interface WebSocketToken {
  token: string;
  url: string;
}

export const getWebPubSubAccessToken = async (tripId: string, userId: string): Promise<WebSocketToken> => {
  // Generate a JWT-like token for WebSocket authentication
  const token = randomBytes(32).toString('hex');
  
  // Store user session in Redis
  const publisher = getRedisPublisher();
  await publisher.setex(`ws:token:${token}`, 3600, JSON.stringify({
    userId,
    tripId,
    roles: [`trip:${tripId}`, `chat:${tripId}`],
    createdAt: Date.now()
  }));
  
  return {
    token,
    url: `ws://localhost:${process.env.PORT || 3000}/ws`
  };
};

// Chat-specific WebSocket functions using Redis Pub/Sub
export const broadcastToChatRoom = async (roomId: string, message: any) => {
  const publisher = getRedisPublisher();
  await publisher.publish(`chat:${roomId}`, JSON.stringify(message));
};

export const broadcastToTrip = async (tripId: string, message: any) => {
  const publisher = getRedisPublisher();
  await publisher.publish(`trip:${tripId}`, JSON.stringify(message));
};

export const addUserToGroup = async (userId: string, groupName: string) => {
  const publisher = getRedisPublisher();
  await publisher.sadd(`group:${groupName}:users`, userId);
  
  // Notify group about user joining
  await publisher.publish(`group:${groupName}`, JSON.stringify({
    type: 'user_joined',
    data: { userId, timestamp: new Date().toISOString() }
  }));
};

export const removeUserFromGroup = async (userId: string, groupName: string) => {
  const publisher = getRedisPublisher();
  await publisher.srem(`group:${groupName}:users`, userId);
  
  // Notify group about user leaving
  await publisher.publish(`group:${groupName}`, JSON.stringify({
    type: 'user_left',
    data: { userId, timestamp: new Date().toISOString() }
  }));
};

export const notifyUserTyping = async (roomId: string, userId: string, isTyping: boolean) => {
  const publisher = getRedisPublisher();
  await publisher.publish(`chat:${roomId}`, JSON.stringify({
    type: 'user_typing',
    data: {
      userId,
      isTyping,
      timestamp: new Date().toISOString()
    }
  }));
};

export const notifyUserPresence = async (roomId: string, userId: string, isOnline: boolean) => {
  const publisher = getRedisPublisher();
  await publisher.publish(`chat:${roomId}`, JSON.stringify({
    type: 'user_presence',
    data: {
      userId,
      isOnline,
      timestamp: new Date().toISOString()
    }
  }));
};
