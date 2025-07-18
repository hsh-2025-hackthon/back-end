// Using globals provided by Jest environment
import { ChatRepository } from '../../../src/models/chat';

// Mock database
const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn()
};

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => mockDb)
}));

describe('ChatRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createRoom', () => {
    it('should create a new chat room successfully', async () => {
      const mockRoom = {
        id: 'room-123',
        tripId: 'trip-123',
        name: 'Test Room',
        description: 'Test Description',
        isDefault: false,
        createdBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.query.mockResolvedValue({
        rows: [mockRoom]
      });

      const roomData = {
        tripId: 'trip-123',
        name: 'Test Room',
        description: 'Test Description',
        createdBy: 'user-123'
      };

      const result = await ChatRepository.createRoom(roomData);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO chat_rooms'),
        ['trip-123', 'Test Room', 'Test Description', false, 'user-123']
      );
      expect(result).toEqual(mockRoom);
    });

    it('should handle creation without description', async () => {
      const mockRoom = {
        id: 'room-123',
        tripId: 'trip-123',
        name: 'Test Room',
        description: null,
        isDefault: false,
        createdBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.query.mockResolvedValue({
        rows: [mockRoom]
      });

      const roomData = {
        tripId: 'trip-123',
        name: 'Test Room',
        createdBy: 'user-123'
      };

      const result = await ChatRepository.createRoom(roomData);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO chat_rooms'),
        ['trip-123', 'Test Room', undefined, false, 'user-123']
      );
      expect(result).toEqual(mockRoom);
    });
  });

  describe('findRoomsByTripId', () => {
    it('should return rooms for a trip', async () => {
      const mockRooms = [
        {
          id: 'room-1',
          tripId: 'trip-123',
          name: 'General',
          isDefault: true,
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'room-2',
          tripId: 'trip-123',
          name: 'Planning',
          isDefault: false,
          createdBy: 'user-456',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockDb.query.mockResolvedValue({
        rows: mockRooms
      });

      const result = await ChatRepository.findRoomsByTripId('trip-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, trip_id as "tripId"'),
        ['trip-123']
      );
      expect(result).toEqual(mockRooms);
    });

    it('should return empty array when no rooms found', async () => {
      mockDb.query.mockResolvedValue({
        rows: []
      });

      const result = await ChatRepository.findRoomsByTripId('trip-123');

      expect(result).toEqual([]);
    });
  });

  describe('createMessage', () => {
    it('should create a new message successfully', async () => {
      const mockMessage = {
        id: 'msg-123',
        roomId: 'room-123',
        userId: 'user-123',
        content: 'Hello, world!',
        messageType: 'text',
        metadata: {},
        repliedTo: null,
        editedAt: null,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.query.mockResolvedValue({
        rows: [mockMessage]
      });

      const messageData = {
        roomId: 'room-123',
        userId: 'user-123',
        content: 'Hello, world!',
        messageType: 'text' as const
      };

      const result = await ChatRepository.createMessage(messageData);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO chat_messages'),
        ['room-123', 'user-123', 'Hello, world!', 'text', '{}', undefined]
      );
      expect(result).toEqual(mockMessage);
    });

    it('should create message with metadata and reply', async () => {
      const mockMessage = {
        id: 'msg-123',
        roomId: 'room-123',
        userId: 'user-123',
        content: 'Reply message',
        messageType: 'text',
        metadata: { sentiment: 'positive' },
        repliedTo: 'msg-456',
        editedAt: null,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.query.mockResolvedValue({
        rows: [mockMessage]
      });

      const messageData = {
        roomId: 'room-123',
        userId: 'user-123',
        content: 'Reply message',
        messageType: 'text' as const,
        metadata: { sentiment: 'positive' },
        repliedTo: 'msg-456'
      };

      const result = await ChatRepository.createMessage(messageData);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO chat_messages'),
        ['room-123', 'user-123', 'Reply message', 'text', '{"sentiment":"positive"}', 'msg-456']
      );
      expect(result).toEqual(mockMessage);
    });
  });

  describe('getMessages', () => {
    it('should get messages with default options', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          roomId: 'room-123',
          userId: 'user-123',
          content: 'Message 1',
          messageType: 'text',
          metadata: {},
          repliedTo: null,
          editedAt: null,
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          name: 'John Doe',
          email: 'john@example.com'
        }
      ];

      mockDb.query.mockResolvedValue({
        rows: mockMessages
      });

      const result = await ChatRepository.getMessages('room-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT cm.id, cm.room_id as "roomId"'),
        ['room-123', 50]
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({
        id: 'msg-1',
        content: 'Message 1',
        user: expect.objectContaining({
          id: 'user-123',
          name: 'John Doe',
          email: 'john@example.com'
        })
      }));
    });

    it('should get messages with pagination', async () => {
      const mockMessages = [
        {
          id: 'msg-2',
          roomId: 'room-123',
          userId: 'user-123',
          content: 'Message 2',
          messageType: 'text',
          metadata: {},
          repliedTo: null,
          editedAt: null,
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          name: 'John Doe',
          email: 'john@example.com'
        }
      ];

      mockDb.query.mockResolvedValue({
        rows: mockMessages
      });

      const result = await ChatRepository.getMessages('room-123', {
        limit: 10,
        before: 'msg-1'
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('cm.created_at < (SELECT created_at FROM chat_messages WHERE id = $2)'),
        ['room-123', 'msg-1', 10]
      );
      expect(result).toHaveLength(1);
    });

    it('should filter messages by type', async () => {
      mockDb.query.mockResolvedValue({
        rows: []
      });

      await ChatRepository.getMessages('room-123', {
        types: ['system', 'ai_suggestion']
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('cm.message_type = ANY($2)'),
        ['room-123', ['system', 'ai_suggestion'], 50]
      );
    });
  });

  describe('addMember', () => {
    it('should add member to room', async () => {
      mockDb.query.mockResolvedValue({
        rows: []
      });

      await ChatRepository.addMember('room-123', 'user-123', 'member');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO chat_room_members'),
        ['room-123', 'user-123', 'member']
      );
    });

    it('should use default role when not specified', async () => {
      mockDb.query.mockResolvedValue({
        rows: []
      });

      await ChatRepository.addMember('room-123', 'user-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO chat_room_members'),
        ['room-123', 'user-123', 'member']
      );
    });
  });

  describe('getRoomMembers', () => {
    it('should get room members with user info', async () => {
      const mockMembers = [
        {
          roomId: 'room-123',
          userId: 'user-123',
          role: 'admin',
          permissions: ['read', 'write'],
          joinedAt: new Date(),
          lastReadAt: new Date(),
          notificationEnabled: true,
          id: 'user-123',
          name: 'John Doe',
          email: 'john@example.com'
        }
      ];

      mockDb.query.mockResolvedValue({
        rows: mockMembers
      });

      const result = await ChatRepository.getRoomMembers('room-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT crm.room_id as "roomId"'),
        ['room-123']
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({
        roomId: 'room-123',
        userId: 'user-123',
        role: 'admin',
        user: expect.objectContaining({
          id: 'user-123',
          name: 'John Doe',
          email: 'john@example.com'
        })
      }));
    });
  });

  describe('searchMessages', () => {
    it('should search messages by content', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          roomId: 'room-123',
          userId: 'user-123',
          content: 'Looking for Tokyo recommendations',
          messageType: 'text',
          metadata: {},
          repliedTo: null,
          editedAt: null,
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          name: 'John Doe',
          email: 'john@example.com'
        }
      ];

      mockDb.query.mockResolvedValue({
        rows: mockMessages
      });

      const result = await ChatRepository.searchMessages('room-123', 'Tokyo');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('cm.content ILIKE $2'),
        ['room-123', '%Tokyo%']
      );
      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('Tokyo');
    });
  });

  describe('userHasAccess', () => {
    it('should return true when user has access', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ exists: true }]
      });

      const result = await ChatRepository.userHasAccess('room-123', 'user-123');

      expect(result).toBe(true);
    });

    it('should return false when user has no access', async () => {
      mockDb.query.mockResolvedValue({
        rows: []
      });

      const result = await ChatRepository.userHasAccess('room-123', 'user-123');

      expect(result).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    it('should return user permissions', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ permissions: ['read', 'write'] }]
      });

      const result = await ChatRepository.getUserPermissions('room-123', 'user-123');

      expect(result).toEqual(['read', 'write']);
    });

    it('should return empty array when no permissions found', async () => {
      mockDb.query.mockResolvedValue({
        rows: []
      });

      const result = await ChatRepository.getUserPermissions('room-123', 'user-123');

      expect(result).toEqual([]);
    });
  });
});