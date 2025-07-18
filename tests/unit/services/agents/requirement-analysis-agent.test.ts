import { RequirementAnalysisAgent, TravelRequirements } from '../../../../src/services/agents/requirement-analysis-agent';
import { AgentContext } from '../../../../src/services/agents/base-agent';
import { getOpenAIClient } from '../../../../src/lib/openai';

// Mock OpenAI client
jest.mock('../../../../src/lib/openai');

describe('RequirementAnalysisAgent', () => {
  let agent: RequirementAnalysisAgent;
  let mockOpenAIClient: any;

  beforeEach(() => {
    mockOpenAIClient = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    };
    (getOpenAIClient as jest.Mock).mockReturnValue(mockOpenAIClient);
    agent = new RequirementAnalysisAgent();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    const mockContext: AgentContext = {
      tripId: 'trip-123',
      userId: 'user-123',
      sessionId: 'session-123',
      timestamp: new Date('2024-03-15T10:00:00Z')
    };

    const mockChatMessages = [
      {
        id: '1',
        content: 'I want to visit Tokyo and Kyoto for 7 days with a budget of $3000',
        userId: 'user-123',
        roomId: 'room-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        messageType: 'text' as const,
        isDeleted: false,
        metadata: {}
      },
      {
        id: '2',
        content: 'We love cultural activities and good food',
        userId: 'user-124',
        roomId: 'room-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        messageType: 'text' as const,
        isDeleted: false,
        metadata: {}
      }
    ];

    it('should successfully analyze requirements from chat messages', async () => {
      const mockRequirements: TravelRequirements = {
        destinations: ['Tokyo', 'Kyoto'],
        budget: {
          total: 3000,
          currency: 'USD',
          categories: {
            accommodation: 40,
            transportation: 20,
            activities: 25,
            food: 10,
            shopping: 5
          }
        },
        dates: {
          startDate: new Date('2024-04-01'),
          endDate: new Date('2024-04-08'),
          duration: 7,
          flexibility: 'flexible'
        },
        preferences: {
          accommodationType: ['hotel'],
          transportationMode: ['train', 'flight'],
          activityTypes: ['cultural', 'food'],
          diningStyle: ['local'],
          pace: 'moderate'
        },
        groupDynamics: {
          size: 2,
          interests: ['culture', 'food'],
          specialNeeds: []
        },
        priorities: {
          primary: ['cultural experiences', 'authentic food'],
          secondary: ['comfortable accommodation'],
          dealbreakers: []
        },
        sentiment: {
          overall: 'positive',
          excitement: 0.8,
          consensus: 0.9
        },
        confidence: 0.85
      };

      // Mock NLP parser results
      const mockNLPResults = [
        {
          destinations: ['Tokyo', 'Kyoto'],
          budget: 3000,
          interests: ['culture', 'food'],
          dates: ['2024-04-01'],
          intent: 'planning',
          confidence: 0.8
        }
      ];

      // Mock sentiment analysis
      const mockSentiment = {
        sentiment: 'positive',
        engagement: 'high',
        topics: ['travel planning', 'Japan', 'culture'],
        recommendations: []
      };

      // Mock AI response
      mockOpenAIClient.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(mockRequirements)
          }
        }]
      });

      const result = await agent.execute(mockContext, {
        chatMessages: mockChatMessages,
        tripContext: {
          budget: 3000,
          duration: 7,
          groupSize: 2
        }
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.destinations).toEqual(['Tokyo', 'Kyoto']);
      expect(result.data?.budget.total).toBe(3000);
      expect(result.data?.groupDynamics.size).toBe(2);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should handle API errors gracefully', async () => {
      mockOpenAIClient.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await agent.execute(mockContext, {
        chatMessages: mockChatMessages
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API Error');
      expect(result.confidence).toBe(0);
    });

    it('should handle invalid JSON response', async () => {
      mockOpenAIClient.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }]
      });

      const result = await agent.execute(mockContext, {
        chatMessages: mockChatMessages
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should validate input parameters', async () => {
      const result = await agent.execute(mockContext, {
        chatMessages: []
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getCapabilities', () => {
    it('should return agent capabilities', () => {
      const capabilities = agent.getCapabilities();
      
      expect(capabilities).toHaveLength(2);
      expect(capabilities[0].name).toBe('analyzeRequirements');
      expect(capabilities[1].name).toBe('extractPreferences');
    });
  });

  describe('getMetadata', () => {
    it('should return agent metadata', () => {
      const metadata = agent.getMetadata();
      
      expect(metadata.name).toBe('RequirementAnalysisAgent');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.capabilities).toHaveLength(2);
    });
  });
});
