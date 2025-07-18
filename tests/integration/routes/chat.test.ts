// Using globals provided by Jest environment
import request from 'supertest';
import express from 'express';
import chatRouter from '../../../src/api/routes/chat';

// Mock dependencies
jest.mock('../../../src/models/chat');
jest.mock('../../../src/models/trip');
jest.mock('../../../src/lib/webpubsub');

import { ChatRepository } from '../../../src/models/chat';
import { TripRepository } from '../../../src/models/trip';

const mockChatRepository = ChatRepository as jest.Mocked<typeof ChatRepository>;
const mockTripRepository = TripRepository as jest.Mocked<typeof TripRepository>;

// Mock auth middleware
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User'
};

jest.mock('../../../src/api/middleware/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.user = mockUser;
    next();
  }
}));

describe('Chat API Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', chatRouter);
    jest.clearAllMocks();
  });

  describe('GET /api/trips/:tripId/chat/rooms', () => {
    it('should get chat rooms for a trip', async () => {
      const mockRooms = [
        {
          id: 'room-1',
          tripId: 'trip-123',
          name: 'General',
          description: 'General discussion',
          isDefault: true,
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'room-2',
          tripId: 'trip-123',
          name: 'Planning',
          description: 'Trip planning',
          isDefault: false,
          createdBy: 'user-456',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      // Mock trip access check
      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        title: 'Test Trip',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);

      mockChatRepository.findRoomsByTripId.mockResolvedValue(mockRooms);

      const response = await request(app)
        .get('/api/trips/trip-123/chat/rooms')
        .expect(200);

      expect(response.body).toEqual(mockRooms);
      expect(mockChatRepository.findRoomsByTripId).toHaveBeenCalledWith('trip-123');
    });

    it('should return 403 when user has no access to trip', async () => {
      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        title: 'Test Trip',
        createdBy: 'other-user'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/trips/trip-123/chat/rooms')
        .expect(403);

      expect(response.body).toEqual({ message: 'Access denied' });
    });

    it('should include members when requested', async () => {
      const mockRooms = [
        {
          id: 'room-1',
          tripId: 'trip-123',
          name: 'General',
          isDefault: true,
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const mockMembers = [
        {
          roomId: 'room-1',
          userId: 'user-123',
          role: 'admin' as const,
          permissions: ['read', 'write'],
          joinedAt: new Date(),
          lastReadAt: new Date(),
          notificationEnabled: true
        }
      ];

      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockChatRepository.findRoomsByTripId.mockResolvedValue(mockRooms);
      mockChatRepository.getRoomMembers.mockResolvedValue(mockMembers);

      const response = await request(app)
        .get('/api/trips/trip-123/chat/rooms?include_members=true')
        .expect(200);

      expect(response.body[0].members).toEqual(mockMembers);
      expect(mockChatRepository.getRoomMembers).toHaveBeenCalledWith('room-1');
    });
  });

  describe('POST /api/trips/:tripId/chat/rooms', () => {
    it('should create a new chat room', async () => {
      const mockRoom = {
        id: 'room-123',
        tripId: 'trip-123',
        name: 'New Room',
        description: 'A new room',
        isDefault: false,
        createdBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockChatRepository.createRoom.mockResolvedValue(mockRoom);
      mockChatRepository.addMember.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/trips/trip-123/chat/rooms')
        .send({
          name: 'New Room',
          description: 'A new room'
        })
        .expect(201);

      expect(response.body).toEqual(mockRoom);
      expect(mockChatRepository.createRoom).toHaveBeenCalledWith({
        name: 'New Room',
        description: 'A new room',
        tripId: 'trip-123',
        createdBy: 'user-123'
      });
    });

    it('should return 400 for invalid room data', async () => {
      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/trips/trip-123/chat/rooms')
        .send({
          name: '', // Invalid: empty name
          description: 'A new room'
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid room data');
    });
  });

  describe('GET /api/chat/rooms/:roomId/messages', () => {
    it('should get messages from a chat room', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          roomId: 'room-123',
          userId: 'user-123',
          content: 'Hello everyone!',
          messageType: 'text' as const,
          metadata: {},
          repliedTo: undefined,
          editedAt: undefined,
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: {
            id: 'user-123',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }
      ];

      mockChatRepository.findRoomById.mockResolvedValue({
        id: 'room-123',
        tripId: 'trip-123',
        name: 'Test Room',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockChatRepository.userHasAccess.mockResolvedValue(true);
      mockChatRepository.getMessages.mockResolvedValue(mockMessages);

      const response = await request(app)
        .get('/api/chat/rooms/room-123/messages')
        .expect(200);

      expect(response.body.messages).toEqual(mockMessages);
      expect(response.body.has_more).toBe(false);
    });

    it('should return 403 when user has no access to room', async () => {
      mockChatRepository.findRoomById.mockResolvedValue({
        id: 'room-123',
        tripId: 'trip-123',
        name: 'Test Room',
        createdBy: 'other-user'
      } as any);

      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'other-user'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockChatRepository.userHasAccess.mockResolvedValue(false);

      const response = await request(app)
        .get('/api/chat/rooms/room-123/messages')
        .expect(403);

      expect(response.body.message).toBe('Access denied to this chat room');
    });

    it('should support pagination', async () => {
      const mockMessages = Array.from({ length: 20 }, (_, i) => ({
        id: `msg-${i}`,
        roomId: 'room-123',
        userId: 'user-123',
        content: `Message ${i}`,
        messageType: 'text' as const,
        metadata: {},
        repliedTo: undefined,
        editedAt: undefined,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      mockChatRepository.findRoomById.mockResolvedValue({
        id: 'room-123',
        tripId: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockChatRepository.userHasAccess.mockResolvedValue(true);
      mockChatRepository.getMessages.mockResolvedValue(mockMessages);

      const response = await request(app)
        .get('/api/chat/rooms/room-123/messages?limit=20&before=msg-100')
        .expect(200);

      expect(response.body.messages).toHaveLength(20);
      expect(response.body.has_more).toBe(true);
      expect(response.body.next_cursor).toBe('msg-19');
    });
  });

  describe('POST /api/chat/rooms/:roomId/messages', () => {
    it('should send a message to a chat room', async () => {
      const mockMessage = {
        id: 'msg-123',
        roomId: 'room-123',
        userId: 'user-123',
        content: 'Hello world!',
        messageType: 'text' as const,
        metadata: {},
        repliedTo: undefined,
        editedAt: undefined,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockChatRepository.findRoomById.mockResolvedValue({
        id: 'room-123',
        tripId: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockChatRepository.userHasAccess.mockResolvedValue(true);
      mockChatRepository.getUserPermissions.mockResolvedValue(['read', 'write']);
      mockChatRepository.createMessage.mockResolvedValue(mockMessage);

      const response = await request(app)
        .post('/api/chat/rooms/room-123/messages')
        .send({
          content: 'Hello world!',
          messageType: 'text'
        })
        .expect(201);

      expect(response.body).toEqual(mockMessage);
      expect(mockChatRepository.createMessage).toHaveBeenCalledWith({
        content: 'Hello world!',
        messageType: 'text',
        roomId: 'room-123',
        userId: 'user-123'
      });
    });

    it('should return 403 when user has no write permission', async () => {
      mockChatRepository.findRoomById.mockResolvedValue({
        id: 'room-123',
        tripId: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockChatRepository.userHasAccess.mockResolvedValue(true);
      mockChatRepository.getUserPermissions.mockResolvedValue(['read']); // No write permission

      const response = await request(app)
        .post('/api/chat/rooms/room-123/messages')
        .send({
          content: 'Hello world!'
        })
        .expect(403);

      expect(response.body.message).toBe('You do not have permission to send messages');
    });

    it('should return 400 for invalid message data', async () => {
      mockChatRepository.findRoomById.mockResolvedValue({
        id: 'room-123',
        tripId: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockChatRepository.userHasAccess.mockResolvedValue(true);
      mockChatRepository.getUserPermissions.mockResolvedValue(['read', 'write']);

      const response = await request(app)
        .post('/api/chat/rooms/room-123/messages')
        .send({
          content: '', // Invalid: empty content
          messageType: 'text'
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid message data');
    });
  });

  describe('GET /api/chat/rooms/:roomId/members', () => {
    it('should get chat room members', async () => {
      const mockMembers = [
        {
          roomId: 'room-123',
          userId: 'user-123',
          role: 'admin' as const,
          permissions: ['read', 'write'],
          joinedAt: new Date(),
          lastReadAt: new Date(),
          notificationEnabled: true,
          user: {
            id: 'user-123',
            name: 'Test User',
            email: 'test@example.com',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }
      ];

      mockChatRepository.findRoomById.mockResolvedValue({
        id: 'room-123',
        tripId: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockChatRepository.userHasAccess.mockResolvedValue(true);
      mockChatRepository.getRoomMembers.mockResolvedValue(mockMembers);

      const response = await request(app)
        .get('/api/chat/rooms/room-123/members')
        .expect(200);

      expect(response.body).toEqual(mockMembers);
      expect(mockChatRepository.getRoomMembers).toHaveBeenCalledWith('room-123');
    });
  });

  describe('POST /api/chat/rooms/:roomId/read', () => {
    it('should mark messages as read', async () => {
      mockChatRepository.findRoomById.mockResolvedValue({
        id: 'room-123',
        tripId: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockChatRepository.userHasAccess.mockResolvedValue(true);
      mockChatRepository.markAsRead.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/chat/rooms/room-123/read')
        .send({
          messageId: 'msg-123'
        })
        .expect(200);

      expect(response.body).toEqual({ success: true });
      expect(mockChatRepository.markAsRead).toHaveBeenCalledWith('room-123', 'user-123', 'msg-123');
    });

    it('should return 400 for invalid message ID', async () => {
      mockChatRepository.findRoomById.mockResolvedValue({
        id: 'room-123',
        tripId: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockChatRepository.userHasAccess.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/chat/rooms/room-123/read')
        .send({
          messageId: 'invalid-id' // Invalid UUID
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid request data');
    });
  });
});