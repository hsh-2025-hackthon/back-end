// Using globals provided by Jest environment
import request from 'supertest';
import express from 'express';
import votesRouter from '../../../src/api/routes/votes';

// Mock dependencies
jest.mock('../../../src/models/vote');
jest.mock('../../../src/models/trip');
jest.mock('../../../src/lib/webpubsub');

import { VoteRepository } from '../../../src/models/vote';
import { TripRepository } from '../../../src/models/trip';

const mockVoteRepository = VoteRepository as jest.Mocked<typeof VoteRepository>;
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

describe('Votes API Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', votesRouter);
    jest.clearAllMocks();
  });

  describe('GET /api/trips/:tripId/votes', () => {
    it('should get votes for a trip', async () => {
      const mockVotes = [
        {
          id: 'vote-1',
          tripId: 'trip-123',
          title: 'Where to eat?',
          description: 'Choose our dinner location',
          voteType: 'restaurant',
          options: [
            { id: 'opt-1', name: 'Restaurant A' },
            { id: 'opt-2', name: 'Restaurant B' }
          ],
          settings: {
            multipleChoice: false,
            anonymous: false,
            changeVote: true,
            requireComment: false,
            showResults: 'after_vote'
          },
          creatorId: 'user-123',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          creator: {
            id: 'user-123',
            name: 'Test User',
            email: 'test@example.com'
          }
        }
      ];

      // Mock trip access check
      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        title: 'Test Trip',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockVoteRepository.findVotesByTripId.mockResolvedValue(mockVotes as any);

      const response = await request(app)
        .get('/api/trips/trip-123/votes')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Where to eat?');
      expect(mockVoteRepository.findVotesByTripId).toHaveBeenCalledWith('trip-123', {
        status: undefined,
        voteType: undefined,
        includeResults: false
      });
    });

    it('should return 403 when user has no access to trip', async () => {
      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        title: 'Test Trip',
        createdBy: 'other-user'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/trips/trip-123/votes')
        .expect(403);

      expect(response.body).toEqual({ message: 'Access denied' });
    });

    it('should filter votes by status and type', async () => {
      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockVoteRepository.findVotesByTripId.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/trips/trip-123/votes?status=active&type=restaurant&include_results=true')
        .expect(200);

      expect(mockVoteRepository.findVotesByTripId).toHaveBeenCalledWith('trip-123', {
        status: 'active',
        voteType: 'restaurant',
        includeResults: true
      });
    });
  });

  describe('POST /api/trips/:tripId/votes', () => {
    it('should create a new vote', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        title: 'Restaurant Choice',
        description: 'Where should we eat tonight?',
        voteType: 'restaurant',
        options: [
          { id: 'opt-1', name: 'Italian Restaurant' },
          { id: 'opt-2', name: 'Japanese Restaurant' }
        ],
        settings: {
          multipleChoice: false,
          anonymous: false,
          changeVote: true,
          requireComment: false,
          showResults: 'after_vote'
        },
        creatorId: 'user-123',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);
      mockVoteRepository.createVote.mockResolvedValue(mockVote as any);

      const response = await request(app)
        .post('/api/trips/trip-123/votes')
        .send({
          title: 'Restaurant Choice',
          description: 'Where should we eat tonight?',
          voteType: 'restaurant',
          options: [
            { name: 'Italian Restaurant' },
            { name: 'Japanese Restaurant' }
          ],
          settings: {
            multipleChoice: false,
            anonymous: false,
            changeVote: true,
            requireComment: false,
            showResults: 'after_vote'
          }
        })
        .expect(201);

      expect(response.body).toEqual(mockVote);
      expect(mockVoteRepository.createVote).toHaveBeenCalledWith({
        title: 'Restaurant Choice',
        description: 'Where should we eat tonight?',
        voteType: 'restaurant',
        options: [
          { name: 'Italian Restaurant' },
          { name: 'Japanese Restaurant' }
        ],
        settings: {
          multipleChoice: false,
          anonymous: false,
          changeVote: true,
          requireComment: false,
          showResults: 'after_vote'
        },
        tripId: 'trip-123',
        creatorId: 'user-123',
        deadline: undefined
      });
    });

    it('should return 400 for invalid vote data', async () => {
      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/trips/trip-123/votes')
        .send({
          title: '', // Invalid: empty title
          voteType: 'restaurant',
          options: [
            { name: 'Option 1' },
            { name: 'Option 2' }
          ]
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid vote data');
    });

    it('should return 400 for insufficient options', async () => {
      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/trips/trip-123/votes')
        .send({
          title: 'Single Option Vote',
          voteType: 'restaurant',
          options: [
            { name: 'Only Option' }
          ]
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid vote data');
    });
  });

  describe('GET /api/votes/:voteId', () => {
    it('should get vote details', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        title: 'Test Vote',
        voteType: 'restaurant',
        options: [
          { id: 'opt-1', name: 'Option 1' },
          { id: 'opt-2', name: 'Option 2' }
        ],
        settings: {
          multipleChoice: false,
          anonymous: false,
          changeVote: true,
          requireComment: false,
          showResults: 'after_vote'
        },
        creatorId: 'user-123',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        responses: [
          {
            id: 'resp-1',
            userId: 'user-123',
            selectedOptions: ['opt-1']
          }
        ]
      };

      mockVoteRepository.findVoteById.mockResolvedValue(mockVote as any);

      // Mock trip access check
      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/votes/vote-123?include_responses=true')
        .expect(200);

      expect(response.body.id).toBe('vote-123');
      expect(response.body.responses).toBeDefined();
      expect(mockVoteRepository.findVoteById).toHaveBeenCalledWith('vote-123', true);
    });

    it('should return 404 when vote not found', async () => {
      mockVoteRepository.findVoteById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/votes/vote-123')
        .expect(404);

      expect(response.body.message).toBe('Vote not found');
    });

    it('should hide results when user has not voted and settings require it', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        title: 'Test Vote',
        settings: {
          showResults: 'after_vote'
        },
        creatorId: 'user-456',
        status: 'active',
        responses: [
          {
            id: 'resp-1',
            userId: 'user-456',
            selectedOptions: ['opt-1']
          }
        ],
        resultSummary: {
          totalResponses: 1,
          optionResults: []
        }
      };

      mockVoteRepository.findVoteById.mockResolvedValue(mockVote as any);

      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/votes/vote-123?include_responses=true')
        .expect(200);

      expect(response.body.responses).toBeUndefined();
      expect(response.body.resultSummary).toBeUndefined();
    });
  });

  describe('POST /api/votes/:voteId/responses', () => {
    it('should submit a vote response', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        title: 'Test Vote',
        voteType: 'restaurant',
        options: [
          { id: 'opt-1', name: 'Option 1' },
          { id: 'opt-2', name: 'Option 2' }
        ],
        settings: {
          multipleChoice: false,
          anonymous: false,
          changeVote: true,
          requireComment: false,
          showResults: 'after_vote'
        },
        creatorId: 'user-456',
        status: 'active',
        deadline: null
      };

      const mockResponse = {
        id: 'resp-123',
        voteId: 'vote-123',
        userId: 'user-123',
        selectedOptions: ['opt-1'],
        comment: 'Good choice!',
        isAnonymous: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockVoteRepository.canUserVote.mockResolvedValue(true);
      mockVoteRepository.findVoteById.mockResolvedValue(mockVote as any);
      mockVoteRepository.submitResponse.mockResolvedValue(mockResponse);
      mockVoteRepository.updateResultSummary.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/votes/vote-123/responses')
        .send({
          selectedOptions: ['opt-1'],
          comment: 'Good choice!'
        })
        .expect(201);

      expect(response.body).toEqual(mockResponse);
      expect(mockVoteRepository.submitResponse).toHaveBeenCalledWith({
        voteId: 'vote-123',
        userId: 'user-123',
        selectedOptions: ['opt-1'],
        comment: 'Good choice!'
      });
    });

    it('should return 403 when user cannot vote', async () => {
      mockVoteRepository.canUserVote.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/votes/vote-123/responses')
        .send({
          selectedOptions: ['opt-1']
        })
        .expect(403);

      expect(response.body.message).toBe('You cannot vote on this poll');
    });

    it('should return 400 for invalid option IDs', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        options: [
          { id: 'opt-1', name: 'Option 1' },
          { id: 'opt-2', name: 'Option 2' }
        ],
        settings: {
          multipleChoice: false,
          requireComment: false
        },
        status: 'active'
      };

      mockVoteRepository.canUserVote.mockResolvedValue(true);
      mockVoteRepository.findVoteById.mockResolvedValue(mockVote as any);

      const response = await request(app)
        .post('/api/votes/vote-123/responses')
        .send({
          selectedOptions: ['opt-invalid']
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid option IDs');
      expect(response.body.invalid).toEqual(['opt-invalid']);
    });

    it('should return 400 for multiple selections when not allowed', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        options: [
          { id: 'opt-1', name: 'Option 1' },
          { id: 'opt-2', name: 'Option 2' }
        ],
        settings: {
          multipleChoice: false,
          requireComment: false
        },
        status: 'active'
      };

      mockVoteRepository.canUserVote.mockResolvedValue(true);
      mockVoteRepository.findVoteById.mockResolvedValue(mockVote as any);

      const response = await request(app)
        .post('/api/votes/vote-123/responses')
        .send({
          selectedOptions: ['opt-1', 'opt-2']
        })
        .expect(400);

      expect(response.body.message).toBe('This vote does not allow multiple selections');
    });

    it('should return 400 when comment is required but not provided', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        options: [
          { id: 'opt-1', name: 'Option 1' }
        ],
        settings: {
          multipleChoice: false,
          requireComment: true
        },
        status: 'active'
      };

      mockVoteRepository.canUserVote.mockResolvedValue(true);
      mockVoteRepository.findVoteById.mockResolvedValue(mockVote as any);

      const response = await request(app)
        .post('/api/votes/vote-123/responses')
        .send({
          selectedOptions: ['opt-1']
        })
        .expect(400);

      expect(response.body.message).toBe('Comment is required for this vote');
    });
  });

  describe('PUT /api/votes/:voteId/responses', () => {
    it('should update a vote response', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        options: [
          { id: 'opt-1', name: 'Option 1' },
          { id: 'opt-2', name: 'Option 2' }
        ],
        settings: {
          multipleChoice: false,
          changeVote: true,
          requireComment: false
        },
        status: 'active',
        deadline: null
      };

      const mockExistingResponse = {
        id: 'resp-123',
        voteId: 'vote-123',
        userId: 'user-123',
        selectedOptions: ['opt-1']
      };

      const mockUpdatedResponse = {
        id: 'resp-123',
        voteId: 'vote-123',
        userId: 'user-123',
        selectedOptions: ['opt-2'],
        comment: 'Changed my mind!',
        updatedAt: new Date()
      };

      mockVoteRepository.findVoteById.mockResolvedValue(mockVote as any);
      mockVoteRepository.getUserResponse.mockResolvedValue(mockExistingResponse as any);
      mockVoteRepository.updateResponse.mockResolvedValue(mockUpdatedResponse as any);
      mockVoteRepository.updateResultSummary.mockResolvedValue(undefined);

      const response = await request(app)
        .put('/api/votes/vote-123/responses')
        .send({
          selectedOptions: ['opt-2'],
          comment: 'Changed my mind!'
        })
        .expect(200);

      expect(response.body).toEqual(mockUpdatedResponse);
      expect(mockVoteRepository.updateResponse).toHaveBeenCalledWith('vote-123', 'user-123', {
        selectedOptions: ['opt-2'],
        comment: 'Changed my mind!'
      });
    });

    it('should return 404 when no existing response found', async () => {
      const mockVote = {
        id: 'vote-123',
        status: 'active'
      };

      mockVoteRepository.findVoteById.mockResolvedValue(mockVote as any);
      mockVoteRepository.getUserResponse.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/votes/vote-123/responses')
        .send({
          selectedOptions: ['opt-1']
        })
        .expect(404);

      expect(response.body.message).toBe('No existing response found');
    });

    it('should return 403 when vote does not allow changing responses', async () => {
      const mockVote = {
        id: 'vote-123',
        settings: {
          changeVote: false
        },
        status: 'active'
      };

      const mockExistingResponse = {
        id: 'resp-123',
        voteId: 'vote-123',
        userId: 'user-123',
        selectedOptions: ['opt-1'],
        isAnonymous: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockVoteRepository.findVoteById.mockResolvedValue(mockVote as any);
      mockVoteRepository.getUserResponse.mockResolvedValue(mockExistingResponse as any);

      const response = await request(app)
        .put('/api/votes/vote-123/responses')
        .send({
          selectedOptions: ['opt-1']
        })
        .expect(403);

      expect(response.body.message).toBe('This vote does not allow changing responses');
    });
  });

  describe('GET /api/votes/:voteId/results', () => {
    it('should get vote results when user has voted', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        settings: {
          showResults: 'after_vote'
        },
        status: 'active'
      };

      const mockUserResponse = {
        id: 'resp-123',
        voteId: 'vote-123',
        userId: 'user-123'
      };

      const mockResults = {
        totalResponses: 3,
        optionResults: [
          { optionId: 'opt-1', votes: 2, percentage: 66.67 },
          { optionId: 'opt-2', votes: 1, percentage: 33.33 }
        ],
        topChoice: 'opt-1',
        participationRate: 75
      };

      mockVoteRepository.findVoteById.mockResolvedValue(mockVote as any);
      mockVoteRepository.getUserResponse.mockResolvedValue(mockUserResponse as any);
      mockVoteRepository.calculateResults.mockResolvedValue(mockResults);

      // Mock trip access check
      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/votes/vote-123/results')
        .expect(200);

      expect(response.body).toEqual(mockResults);
      expect(mockVoteRepository.calculateResults).toHaveBeenCalledWith('vote-123');
    });

    it('should return 403 when results are not available yet', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        settings: {
          showResults: 'after_vote'
        },
        status: 'active'
      };

      mockVoteRepository.findVoteById.mockResolvedValue(mockVote as any);
      mockVoteRepository.getUserResponse.mockResolvedValue(null); // User has not voted

      // Mock trip access check
      mockTripRepository.findById.mockResolvedValue({
        id: 'trip-123',
        createdBy: 'user-123'
      } as any);

      mockTripRepository.getCollaborators.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/votes/vote-123/results')
        .expect(403);

      expect(response.body.message).toBe('Results not available yet');
    });
  });

  describe('POST /api/votes/:voteId/close', () => {
    it('should close a vote', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        title: 'Test Vote',
        creatorId: 'user-123',
        status: 'active'
      };

      const mockClosedVote = {
        ...mockVote,
        status: 'closed'
      };

      mockVoteRepository.findVoteById.mockResolvedValue(mockVote as any);
      mockVoteRepository.closeVote.mockResolvedValue(mockClosedVote as any);

      const response = await request(app)
        .post('/api/votes/vote-123/close')
        .expect(200);

      expect(response.body.status).toBe('closed');
      expect(mockVoteRepository.closeVote).toHaveBeenCalledWith('vote-123');
    });

    it('should return 403 when user is not vote creator', async () => {
      const mockVote = {
        id: 'vote-123',
        tripId: 'trip-123',
        title: 'Test Vote',
        creatorId: 'other-user',
        status: 'active'
      };

      mockVoteRepository.findVoteById.mockResolvedValue(mockVote as any);

      const response = await request(app)
        .post('/api/votes/vote-123/close')
        .expect(403);

      expect(response.body.message).toBe('Only vote creator can close vote');
    });
  });
});