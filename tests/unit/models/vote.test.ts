// Using globals provided by Jest environment
import { VoteRepository } from '../../../src/models/vote';

// Mock database
const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn()
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => mockDb)
}));

describe('VoteRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.connect.mockResolvedValue(mockClient);
  });

  describe('createVote', () => {
    it('should create a new vote successfully', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        chatMessageId: null,
        title: 'Where should we eat?',
        description: 'Choose our dinner location',
        voteType: 'restaurant',
        options: [
          { id: 'opt_123', name: 'Restaurant A', description: 'Great sushi' },
          { id: 'opt_456', name: 'Restaurant B', description: 'Italian cuisine' }
        ],
        settings: {
          multipleChoice: false,
          anonymous: false,
          changeVote: true,
          requireComment: false,
          showResults: 'after_vote'
        },
        creatorId: 'user-123',
        deadline: null,
        status: 'active',
        resultSummary: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [mockVote] }); // INSERT
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const voteData = {
        tripId: 'trip-123',
        title: 'Where should we eat?',
        description: 'Choose our dinner location',
        voteType: 'restaurant' as const,
        options: [
          { name: 'Restaurant A', description: 'Great sushi' },
          { name: 'Restaurant B', description: 'Italian cuisine' }
        ],
        creatorId: 'user-123'
      };

      const result = await VoteRepository.createVote(voteData);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result).toEqual(mockVote);
    });

    it('should create vote with custom settings', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        title: 'Activity preferences',
        voteType: 'activity',
        options: [
          { id: 'opt_123', name: 'Temple visit' },
          { id: 'opt_456', name: 'Museum tour' }
        ],
        settings: {
          multipleChoice: true,
          anonymous: true,
          changeVote: false,
          requireComment: true,
          showResults: 'always'
        },
        creatorId: 'user-123',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [mockVote] }); // INSERT
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const voteData = {
        tripId: 'trip-123',
        title: 'Activity preferences',
        voteType: 'activity' as const,
        options: [
          { name: 'Temple visit' },
          { name: 'Museum tour' }
        ],
        settings: {
          multipleChoice: true,
          anonymous: true,
          changeVote: false,
          requireComment: true,
          showResults: 'always' as const
        },
        creatorId: 'user-123'
      };

      const result = await VoteRepository.createVote(voteData);

      expect(result.settings.multipleChoice).toBe(true);
      expect(result.settings.anonymous).toBe(true);
      expect(result.settings.requireComment).toBe(true);
    });
  });

  describe('findVotesByTripId', () => {
    it('should return votes for a trip', async () => {
      const mockVotes = [
        {
          id: 'vote-1',
          tripId: 'trip-123',
          title: 'Restaurant choice',
          voteType: 'restaurant',
          options: [],
          settings: {},
          creatorId: 'user-123',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          name: 'John Doe',
          email: 'john@example.com'
        },
        {
          id: 'vote-2',
          tripId: 'trip-123',
          title: 'Activity choice',
          voteType: 'activity',
          options: [],
          settings: {},
          creatorId: 'user-456',
          status: 'closed',
          createdAt: new Date(),
          updatedAt: new Date(),
          name: 'Jane Smith',
          email: 'jane@example.com'
        }
      ];

      mockDb.query.mockResolvedValue({
        rows: mockVotes
      });

      const result = await VoteRepository.findVotesByTripId('trip-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT v.id, v.trip_id as "tripId"'),
        ['trip-123']
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expect.objectContaining({
        id: 'vote-1',
        title: 'Restaurant choice',
        creator: expect.objectContaining({
          id: 'user-123',
          name: 'John Doe',
          email: 'john@example.com'
        })
      }));
    });

    it('should filter votes by status', async () => {
      mockDb.query.mockResolvedValue({
        rows: []
      });

      await VoteRepository.findVotesByTripId('trip-123', { status: 'active' });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('AND v.status = $2'),
        ['trip-123', 'active']
      );
    });

    it('should filter votes by type', async () => {
      mockDb.query.mockResolvedValue({
        rows: []
      });

      await VoteRepository.findVotesByTripId('trip-123', { voteType: 'restaurant' });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('AND v.vote_type = $2'),
        ['trip-123', 'restaurant']
      );
    });
  });

  describe('findVoteById', () => {
    it('should return vote by ID', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        title: 'Test Vote',
        voteType: 'restaurant',
        options: [],
        settings: {},
        creatorId: 'user-123',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        name: 'John Doe',
        email: 'john@example.com'
      };

      mockDb.query.mockResolvedValue({
        rows: [mockVote]
      });

      const result = await VoteRepository.findVoteById('vote-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE v.id = $1'),
        ['vote-123']
      );
      expect(result).toEqual(expect.objectContaining({
        id: 'vote-123',
        title: 'Test Vote',
        creator: expect.objectContaining({
          id: 'user-123',
          name: 'John Doe',
          email: 'john@example.com'
        })
      }));
    });

    it('should return null when vote not found', async () => {
      mockDb.query.mockResolvedValue({
        rows: []
      });

      const result = await VoteRepository.findVoteById('vote-123');

      expect(result).toBeNull();
    });
  });

  describe('submitResponse', () => {
    it('should submit a new vote response', async () => {
      const mockResponse = {
        id: 'response-123',
        voteId: 'vote-123',
        userId: 'user-123',
        selectedOptions: ['opt-1', 'opt-2'],
        ranking: null,
        comment: 'Good choice!',
        isAnonymous: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.query.mockResolvedValue({
        rows: [mockResponse]
      });

      const responseData = {
        voteId: 'vote-123',
        userId: 'user-123',
        selectedOptions: ['opt-1', 'opt-2'],
        comment: 'Good choice!',
        isAnonymous: false
      };

      const result = await VoteRepository.submitResponse(responseData);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO vote_responses'),
        ['vote-123', 'user-123', '["opt-1","opt-2"]', null, 'Good choice!', false]
      );
      expect(result).toEqual(mockResponse);
    });

    it('should submit response with ranking', async () => {
      const mockResponse = {
        id: 'response-123',
        voteId: 'vote-123',
        userId: 'user-123',
        selectedOptions: ['opt-1'],
        ranking: { 'opt-1': 1, 'opt-2': 2 },
        comment: null,
        isAnonymous: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.query.mockResolvedValue({
        rows: [mockResponse]
      });

      const responseData = {
        voteId: 'vote-123',
        userId: 'user-123',
        selectedOptions: ['opt-1'],
        ranking: { 'opt-1': 1, 'opt-2': 2 }
      };

      const result = await VoteRepository.submitResponse(responseData);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO vote_responses'),
        ['vote-123', 'user-123', '["opt-1"]', '{"opt-1":1,"opt-2":2}', undefined, false]
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getVoteResponses', () => {
    it('should get all responses for a vote', async () => {
      const mockResponses = [
        {
          id: 'response-1',
          voteId: 'vote-123',
          userId: 'user-123',
          selectedOptions: ['opt-1'],
          ranking: null,
          comment: 'Great choice!',
          isAnonymous: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          name: 'John Doe',
          email: 'john@example.com'
        },
        {
          id: 'response-2',
          voteId: 'vote-123',
          userId: 'user-456',
          selectedOptions: ['opt-2'],
          ranking: null,
          comment: null,
          isAnonymous: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          name: 'Jane Smith',
          email: 'jane@example.com'
        }
      ];

      mockDb.query.mockResolvedValue({
        rows: mockResponses
      });

      const result = await VoteRepository.getVoteResponses('vote-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE vr.vote_id = $1'),
        ['vote-123']
      );
      expect(result).toHaveLength(2);
      expect(result[0].user).toEqual(expect.objectContaining({
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com'
      }));
      expect(result[1].user).toBeUndefined(); // Anonymous response
    });
  });

  describe('calculateResults', () => {
    it('should calculate vote results correctly', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        options: [
          { id: 'opt-1', name: 'Option 1' },
          { id: 'opt-2', name: 'Option 2' },
          { id: 'opt-3', name: 'Option 3' }
        ]
      };

      const mockResponses = [
        { selectedOptions: ['opt-1'] },
        { selectedOptions: ['opt-1'] },
        { selectedOptions: ['opt-2'] }
      ];

      const mockTripMembers = [
        { count: '3' }, // collaborators
        { count: '1' }  // owner
      ];

      // Mock the findVoteById method
      jest.spyOn(VoteRepository, 'findVoteById').mockResolvedValue(mockVote as any);
      jest.spyOn(VoteRepository, 'getVoteResponses').mockResolvedValue(mockResponses as any);

      mockDb.query.mockResolvedValue({
        rows: mockTripMembers
      });

      const result = await VoteRepository.calculateResults('vote-123');

      expect(result).toEqual({
        totalResponses: 3,
        optionResults: [
          { optionId: 'opt-1', votes: 2, percentage: 66.67 },
          { optionId: 'opt-2', votes: 1, percentage: 33.33 },
          { optionId: 'opt-3', votes: 0, percentage: 0 }
        ],
        topChoice: 'opt-1',
        participationRate: 75 // 3 responses out of 4 total members
      });
    });

    it('should handle empty responses', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        options: [
          { id: 'opt-1', name: 'Option 1' },
          { id: 'opt-2', name: 'Option 2' }
        ]
      };

      jest.spyOn(VoteRepository, 'findVoteById').mockResolvedValue(mockVote as any);
      jest.spyOn(VoteRepository, 'getVoteResponses').mockResolvedValue([]);

      mockDb.query.mockResolvedValue({
        rows: [{ count: '2' }]
      });

      const result = await VoteRepository.calculateResults('vote-123');

      expect(result).toEqual({
        totalResponses: 0,
        optionResults: [
          { optionId: 'opt-1', votes: 0, percentage: 0 },
          { optionId: 'opt-2', votes: 0, percentage: 0 }
        ],
        topChoice: undefined,
        participationRate: 0
      });
    });
  });

  describe('canUserVote', () => {
    it('should return true when user can vote', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        status: 'active',
        deadline: null
      };

      jest.spyOn(VoteRepository, 'findVoteById').mockResolvedValue(mockVote as any);

      mockDb.query.mockResolvedValue({
        rows: [{ exists: true }]
      });

      const result = await VoteRepository.canUserVote('vote-123', 'user-123');

      expect(result).toBe(true);
    });

    it('should return false when vote is not active', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        status: 'closed',
        deadline: null
      };

      jest.spyOn(VoteRepository, 'findVoteById').mockResolvedValue(mockVote as any);

      const result = await VoteRepository.canUserVote('vote-123', 'user-123');

      expect(result).toBe(false);
    });

    it('should return false when deadline has passed', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        status: 'active',
        deadline: pastDate
      };

      jest.spyOn(VoteRepository, 'findVoteById').mockResolvedValue(mockVote as any);

      const result = await VoteRepository.canUserVote('vote-123', 'user-123');

      expect(result).toBe(false);
    });

    it('should return false when user has no trip access', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        status: 'active',
        deadline: null
      };

      jest.spyOn(VoteRepository, 'findVoteById').mockResolvedValue(mockVote as any);

      mockDb.query.mockResolvedValue({
        rows: []
      });

      const result = await VoteRepository.canUserVote('vote-123', 'user-123');

      expect(result).toBe(false);
    });
  });
});