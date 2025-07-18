import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { getRedisClient, getRedisSubscriber } from './redis';
import { URL } from 'url';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  tripId?: string;
  roles?: string[];
}

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: string;
}

export class CollaborativeWebSocketServer {
  private wss: WebSocketServer;
  private subscriber = getRedisSubscriber();
  private redis = getRedisClient();
  private clients = new Map<string, Set<AuthenticatedWebSocket>>();

  constructor(server: any) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });

    this.setupWebSocketServer();
    this.setupRedisSubscriptions();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', async (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
      try {
        // Extract token from query parameters
        const url = new URL(request.url || '', `http://${request.headers.host}`);
        const token = url.searchParams.get('token');

        if (!token) {
          ws.close(1008, 'Missing authentication token');
          return;
        }

        // Validate token and get user info
        const sessionData = await this.redis.get(`ws:token:${token}`);
        if (!sessionData) {
          ws.close(1008, 'Invalid or expired token');
          return;
        }

        const { userId, tripId, roles } = JSON.parse(sessionData);
        ws.userId = userId;
        ws.tripId = tripId;
        ws.roles = roles;

        // Add client to appropriate groups
        this.addClientToGroups(ws);

        // Handle incoming messages
        ws.on('message', async (data) => {
          try {
            const message: WebSocketMessage = JSON.parse(data.toString());
            await this.handleMessage(ws, message);
          } catch (error) {
            console.error('Error handling WebSocket message:', error);
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: 'Invalid message format' }
            }));
          }
        });

        // Handle disconnection
        ws.on('close', () => {
          this.removeClientFromGroups(ws);
          console.log(`WebSocket disconnected: ${userId}`);
        });

        // Send connection confirmation
        ws.send(JSON.stringify({
          type: 'connected',
          data: { userId, tripId, timestamp: new Date().toISOString() }
        }));

        console.log(`WebSocket connected: ${userId} for trip ${tripId}`);

      } catch (error) {
        console.error('Error setting up WebSocket connection:', error);
        ws.close(1011, 'Internal server error');
      }
    });
  }

  private addClientToGroups(ws: AuthenticatedWebSocket) {
    if (!ws.userId || !ws.roles) return;

    ws.roles.forEach(role => {
      if (!this.clients.has(role)) {
        this.clients.set(role, new Set());
      }
      this.clients.get(role)!.add(ws);
    });
  }

  private removeClientFromGroups(ws: AuthenticatedWebSocket) {
    if (!ws.roles) return;

    ws.roles.forEach(role => {
      const roleClients = this.clients.get(role);
      if (roleClients) {
        roleClients.delete(ws);
        if (roleClients.size === 0) {
          this.clients.delete(role);
        }
      }
    });
  }

  private async handleMessage(ws: AuthenticatedWebSocket, message: WebSocketMessage) {
    const { type, data } = message;

    switch (type) {
      case 'chat_message':
        await this.handleChatMessage(ws, data);
        break;
      case 'typing':
        await this.handleTyping(ws, data);
        break;
      case 'cursor_update':
        await this.handleCursorUpdate(ws, data);
        break;
      case 'trip_update':
        await this.handleTripUpdate(ws, data);
        break;
      default:
        console.warn(`Unknown message type: ${type}`);
    }
  }

  private async handleChatMessage(ws: AuthenticatedWebSocket, data: any) {
    if (!ws.tripId) return;

    const message = {
      type: 'chat_message',
      data: {
        ...data,
        userId: ws.userId,
        timestamp: new Date().toISOString()
      }
    };

    // Broadcast to chat room
    await this.redis.publish(`chat:${ws.tripId}`, JSON.stringify(message));
  }

  private async handleTyping(ws: AuthenticatedWebSocket, data: any) {
    if (!ws.tripId) return;

    const message = {
      type: 'user_typing',
      data: {
        userId: ws.userId,
        isTyping: data.isTyping,
        timestamp: new Date().toISOString()
      }
    };

    await this.redis.publish(`chat:${ws.tripId}`, JSON.stringify(message));
  }

  private async handleCursorUpdate(ws: AuthenticatedWebSocket, data: any) {
    if (!ws.tripId) return;

    const message = {
      type: 'cursor_update',
      data: {
        userId: ws.userId,
        cursor: data.cursor,
        timestamp: new Date().toISOString()
      }
    };

    await this.redis.publish(`trip:${ws.tripId}`, JSON.stringify(message));
  }

  private async handleTripUpdate(ws: AuthenticatedWebSocket, data: any) {
    if (!ws.tripId) return;

    const message = {
      type: 'trip_update',
      data: {
        ...data,
        userId: ws.userId,
        timestamp: new Date().toISOString()
      }
    };

    await this.redis.publish(`trip:${ws.tripId}`, JSON.stringify(message));
  }

  private setupRedisSubscriptions() {
    // Subscribe to all patterns
    this.subscriber.psubscribe('chat:*', 'trip:*', 'group:*');

    this.subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
      try {
        const parsedMessage = JSON.parse(message);
        this.broadcastToChannel(channel, parsedMessage);
      } catch (error) {
        console.error('Error processing Redis message:', error);
      }
    });
  }

  private broadcastToChannel(channel: string, message: WebSocketMessage) {
    const clients = this.clients.get(channel);
    if (!clients) return;

    const messageStr = JSON.stringify(message);
    
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        // Don't send message back to sender
        if (message.data?.userId !== client.userId) {
          client.send(messageStr);
        }
      }
    });
  }

  public getConnectedUsers(tripId: string): string[] {
    const tripClients = this.clients.get(`trip:${tripId}`);
    if (!tripClients) return [];
    
    return Array.from(tripClients)
      .filter(client => client.readyState === WebSocket.OPEN)
      .map(client => client.userId!)
      .filter(Boolean);
  }

  public async close() {
    await this.subscriber.unsubscribe();
    this.wss.close();
  }
}