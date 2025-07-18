import request from 'supertest';
import express from 'express';
import agentsRouter from '../../../src/api/routes/agents';
import { TripRepository } from '../../../src/models/trip';

// Mock dependencies
jest.mock('../../../src/models/trip');
jest.mock('../../../src/services/agents/agent-coordinator');
jest.mock('../../../src/lib/openai');

const app = express();
app.use(express.json());

// Mock auth middleware
app.use((req, res, next) => {
  req.user = { 
    id: 'user-123', 
    email: 'test@example.com',
    googleId: 'google-123',
    name: 'Test User'
  };
  next();
});

app.use('/api', agentsRouter);

describe('Agents API Integration Tests', () => {
  const mockTrip = {
    id: 'trip-123',
    title: 'Test Trip',
    startDate: new Date('2024-04-01'),
    endDate: new Date('2024-04-08'),
    budget: 3000,
    currency: 'USD',
    createdBy: 'user-123'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (TripRepository.findById as jest.Mock).mockResolvedValue(mockTrip);
  });

  describe('POST /api/trips/:tripId/agents/optimize-itinerary', () => {
    it('should successfully optimize itinerary', async () => {
      const mockOptimizationResult = {
        success: true,
        sessionId: 'session-123',
        requirements: {
          destinations: ['Tokyo', 'Kyoto'],
          budget: { total: 3000, currency: 'USD' },
          confidence: 0.85
        },
        optimizedItinerary: {
          id: 'itinerary-123',
          name: 'Optimized Japan Trip',
          totalCost: 2800,
          currency: 'USD',
          optimizationScore: 0.9
        },
        alternatives: [],
        confidence: 0.85,
        processingTime: 1500,
        recommendations: ['Great itinerary!'],
        warnings: []
      };

      // Mock agent coordinator
      const { agentCoordinator } = require('../../../src/services/agents/agent-coordinator');
      agentCoordinator.orchestrateItineraryOptimization.mockResolvedValue(mockOptimizationResult);

      const response = await request(app)
        .post('/api/trips/trip-123/agents/optimize-itinerary')
        .send({
          messages: [
            { content: 'I want to visit Tokyo and Kyoto' },
            { content: 'Budget is $3000' }
          ],
          options: {
            prioritizeTime: false,
            prioritizeCost: true,
            prioritizeExperience: true
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.sessionId).toBe('session-123');
      expect(response.body.requirements).toBeDefined();
      expect(response.body.itinerary).toBeDefined();
      expect(response.body.confidence).toBe(0.85);
    });

    it('should return 400 for missing messages', async () => {
      const response = await request(app)
        .post('/api/trips/trip-123/agents/optimize-itinerary')
        .send({
          options: {}
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Messages array is required');
    });

    it('should return 404 for non-existent trip', async () => {
      (TripRepository.findById as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/trips/non-existent/agents/optimize-itinerary')
        .send({
          messages: [{ content: 'test' }]
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Trip not found');
    });
  });

  describe('POST /api/trips/:tripId/agents/analyze-requirements', () => {
    it('should successfully analyze requirements', async () => {
      const mockAnalysisResult = {
        success: true,
        sessionId: 'session-124',
        requirements: {
          destinations: ['Tokyo'],
          budget: { total: 2000, currency: 'USD' },
          confidence: 0.75
        },
        confidence: 0.75,
        processingTime: 800,
        recommendations: ['Consider adding more destinations'],
        warnings: []
      };

      const { agentCoordinator } = require('../../../src/services/agents/agent-coordinator');
      agentCoordinator.orchestrateItineraryOptimization.mockResolvedValue(mockAnalysisResult);

      const response = await request(app)
        .post('/api/trips/trip-123/agents/analyze-requirements')
        .send({
          messages: [
            { content: 'I want to go to Tokyo' },
            { content: 'My budget is $2000' }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.sessionId).toBe('session-124');
      expect(response.body.requirements).toBeDefined();
      expect(response.body.confidence).toBe(0.75);
    });
  });

  describe('POST /api/trips/:tripId/agents/adjust-plan', () => {
    it('should successfully create adjustment plan', async () => {
      const mockAdjustmentPlan = {
        sessionId: 'session-125',
        disruption: {
          type: 'weather',
          severity: 'high',
          description: 'Typhoon approaching Tokyo'
        },
        originalItinerary: {},
        adjustedItinerary: {},
        impactAnalysis: {
          affectedDays: 2,
          costImpact: 200,
          experienceImpact: -0.3
        },
        alternatives: [],
        recommendations: ['Stay indoors', 'Consider indoor activities']
      };

      const { agentCoordinator } = require('../../../src/services/agents/agent-coordinator');
      agentCoordinator.handleAdaptiveAdjustments.mockResolvedValue(mockAdjustmentPlan);

      const response = await request(app)
        .post('/api/trips/trip-123/agents/adjust-plan')
        .send({
          disruption: {
            type: 'weather',
            severity: 'high',
            description: 'Typhoon approaching Tokyo',
            affectedDestination: 'Tokyo',
            affectedDate: '2024-04-02'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.sessionId).toBe('session-125');
      expect(response.body.disruption.type).toBe('weather');
      expect(response.body.impactAnalysis).toBeDefined();
    });

    it('should return 400 for missing disruption info', async () => {
      const response = await request(app)
        .post('/api/trips/trip-123/agents/adjust-plan')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Disruption information is required');
    });
  });

  describe('GET /api/trips/:tripId/agents/status/:sessionId', () => {
    it('should return session status', async () => {
      const mockSession = {
        id: 'session-123',
        tripId: 'trip-123',
        userId: 'user-123',
        status: 'completed',
        currentStep: 'finalization',
        progress: 100,
        startTime: new Date('2024-03-15T10:00:00Z'),
        endTime: new Date('2024-03-15T10:02:00Z'),
        errors: [],
        results: { itinerary: {} }
      };

      const { agentCoordinator } = require('../../../src/services/agents/agent-coordinator');
      agentCoordinator.getSessionStatus.mockReturnValue(mockSession);

      const response = await request(app)
        .get('/api/trips/trip-123/agents/status/session-123');

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBe('session-123');
      expect(response.body.status).toBe('completed');
      expect(response.body.progress).toBe(100);
      expect(response.body.hasResults).toBe(true);
    });

    it('should return 404 for non-existent session', async () => {
      const { agentCoordinator } = require('../../../src/services/agents/agent-coordinator');
      agentCoordinator.getSessionStatus.mockReturnValue(undefined);

      const response = await request(app)
        .get('/api/trips/trip-123/agents/status/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Session not found');
    });
  });

  describe('DELETE /api/trips/:tripId/agents/sessions/:sessionId', () => {
    it('should successfully cancel session', async () => {
      const mockSession = {
        id: 'session-123',
        tripId: 'trip-123',
        userId: 'user-123',
        status: 'active'
      };

      const { agentCoordinator } = require('../../../src/services/agents/agent-coordinator');
      agentCoordinator.getSessionStatus.mockReturnValue(mockSession);
      agentCoordinator.cancelSession.mockReturnValue(true);

      const response = await request(app)
        .delete('/api/trips/trip-123/agents/sessions/session-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('cancelled successfully');
    });
  });

  describe('GET /api/agents/available', () => {
    it('should return available agents', async () => {
      const mockAgents = [
        {
          name: 'requirement-analysis',
          metadata: {
            name: 'RequirementAnalysisAgent',
            version: '1.0.0',
            capabilities: [
              {
                name: 'analyzeRequirements',
                description: 'Analyze requirements from chat messages'
              }
            ]
          }
        },
        {
          name: 'itinerary-optimization',
          metadata: {
            name: 'ItineraryOptimizationAgent',
            version: '1.0.0',
            capabilities: [
              {
                name: 'optimizeRoute',
                description: 'Optimize travel routes'
              }
            ]
          }
        }
      ];

      const { agentCoordinator } = require('../../../src/services/agents/agent-coordinator');
      agentCoordinator.getAvailableAgents.mockReturnValue(mockAgents);

      const response = await request(app)
        .get('/api/agents/available');

      expect(response.status).toBe(200);
      expect(response.body.agents).toHaveLength(2);
      expect(response.body.totalAgents).toBe(2);
      expect(response.body.agents[0].name).toBe('requirement-analysis');
    });
  });
});
