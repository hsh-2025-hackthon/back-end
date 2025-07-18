// Using globals provided by Jest environment
import { NLPParserService } from '../../../src/lib/nlp-parser';

// Mock OpenAI client
const mockCreate = jest.fn();

jest.mock('../../../src/lib/openai', () => ({
  getOpenAIClient: jest.fn().mockReturnValue({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  })
}));

import { getOpenAIClient } from '../../../src/lib/openai';

describe('NLPParserService', () => {
  let nlpService: NLPParserService;
  let mockOpenAIClient: any;

  beforeEach(() => {
    mockOpenAIClient = (getOpenAIClient as jest.Mock)();
    nlpService = new NLPParserService();
    jest.clearAllMocks();
  });

  describe('parseMessage', () => {
    it('should parse a travel message and extract destinations', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              destinations: ['Tokyo', 'Kyoto'],
              dates: ['2024-03-15'],
              budget: 50000,
              interests: ['culture', 'food'],
              preferences: {
                accommodation: ['hotel'],
                transportation: ['train'],
                activities: ['temple visits']
              },
              mentions: {
                restaurants: ['Tsukiji Market'],
                attractions: ['Kiyomizu Temple'],
                hotels: []
              },
              intent: 'suggestion',
              confidence: 0.85
            })
          }
        }]
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await nlpService.parseMessage('I want to visit Tokyo and Kyoto in March with a budget of 50000 yen');

      expect(result.destinations).toEqual(['Tokyo', 'Kyoto']);
      expect(result.budget).toBe(50000);
      expect(result.interests).toEqual(['culture', 'food']);
      expect(result.intent).toBe('suggestion');
      expect(result.confidence).toBe(0.85);
      expect(result.dates).toHaveLength(1);
      expect(result.dates[0]).toBeInstanceOf(Date);
    });

    it('should handle vote request intent', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              destinations: [],
              dates: [],
              budget: null,
              interests: [],
              preferences: {
                accommodation: [],
                transportation: [],
                activities: []
              },
              mentions: {
                restaurants: ['Restaurant A', 'Restaurant B'],
                attractions: [],
                hotels: []
              },
              intent: 'vote_request',
              confidence: 0.9
            })
          }
        }]
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await nlpService.parseMessage('Should we vote on which restaurant to choose?');

      expect(result.intent).toBe('vote_request');
      expect(result.mentions.restaurants).toEqual(['Restaurant A', 'Restaurant B']);
      expect(result.confidence).toBe(0.9);
    });

    it('should handle booking intent', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              destinations: ['Tokyo'],
              dates: ['2024-03-15', '2024-03-20'],
              budget: 100000,
              interests: [],
              preferences: {
                accommodation: ['hotel'],
                transportation: ['flight'],
                activities: []
              },
              mentions: {
                restaurants: [],
                attractions: [],
                hotels: ['Hotel Okura']
              },
              intent: 'booking',
              confidence: 0.8
            })
          }
        }]
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await nlpService.parseMessage('I need to book a hotel in Tokyo for March 15-20');

      expect(result.intent).toBe('booking');
      expect(result.destinations).toEqual(['Tokyo']);
      expect(result.dates).toHaveLength(2);
      expect(result.mentions.hotels).toEqual(['Hotel Okura']);
      expect(result.preferences.accommodation).toEqual(['hotel']);
    });

    it('should handle OpenAI API errors gracefully', async () => {
      mockOpenAIClient.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await nlpService.parseMessage('Test message');

      expect(result.destinations).toEqual([]);
      expect(result.budget).toBeNull();
      expect(result.intent).toBe('general');
      expect(result.confidence).toBe(0);
    });

    it('should handle invalid JSON response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }]
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await nlpService.parseMessage('Test message');

      expect(result.destinations).toEqual([]);
      expect(result.intent).toBe('general');
      expect(result.confidence).toBe(0);
    });

    it('should clean up code blocks from response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: `\`\`\`json
            {
              "destinations": ["Paris"],
              "dates": [],
              "budget": null,
              "interests": [],
              "preferences": {
                "accommodation": [],
                "transportation": [],
                "activities": []
              },
              "mentions": {
                "restaurants": [],
                "attractions": [],
                "hotels": []
              },
              "intent": "general",
              "confidence": 0.7
            }
            \`\`\``
          }
        }]
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await nlpService.parseMessage('I love Paris');

      expect(result.destinations).toEqual(['Paris']);
      expect(result.confidence).toBe(0.7);
    });
  });

  describe('extractIntentions', () => {
    it('should extract travel intents from multiple messages', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          userId: 'user-1',
          content: 'I want to add Tokyo to our itinerary',
          user: { name: 'John' }
        },
        {
          id: 'msg-2',
          userId: 'user-2',
          content: 'What about setting a budget of $2000?',
          user: { name: 'Jane' }
        }
      ] as any;

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify([
              {
                type: 'add_destination',
                entities: { destinations: ['Tokyo'] },
                confidence: 0.9,
                suggestedActions: ['Add Tokyo to itinerary', 'Check travel dates']
              },
              {
                type: 'set_budget',
                entities: { budget: 2000 },
                confidence: 0.8,
                suggestedActions: ['Set budget to $2000', 'Calculate per-person cost']
              }
            ])
          }
        }]
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await nlpService.extractIntentions(mockMessages);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('add_destination');
      expect(result[0].entities.destinations).toEqual(['Tokyo']);
      expect(result[1].type).toBe('set_budget');
      expect(result[1].entities.budget).toBe(2000);
    });

    it('should handle empty message array', async () => {
      const result = await nlpService.extractIntentions([]);

      expect(result).toEqual([]);
    });

    it('should handle API errors', async () => {
      mockOpenAIClient.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await nlpService.extractIntentions([{ content: 'test' }] as any);

      expect(result).toEqual([]);
    });
  });

  describe('generateSuggestions', () => {
    it('should generate suggestions based on destinations', async () => {
      const context = {
        destinations: ['Tokyo', 'Kyoto'],
        dates: [],
        budget: null,
        interests: [],
        preferences: {
          accommodation: [],
          transportation: [],
          activities: []
        },
        mentions: {
          restaurants: [],
          attractions: [],
          hotels: []
        },
        intent: 'suggestion' as const,
        confidence: 0.8
      };

      const result = await nlpService.generateSuggestions(context);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('destination_info');
      expect(result[0].title).toContain('Tokyo, Kyoto');
      expect(result[0].priority).toBe('high');
    });

    it('should generate budget suggestions', async () => {
      const context = {
        destinations: ['Tokyo'],
        dates: [],
        budget: 100000,
        interests: [],
        preferences: {
          accommodation: [],
          transportation: [],
          activities: []
        },
        mentions: {
          restaurants: [],
          attractions: [],
          hotels: []
        },
        intent: 'suggestion' as const,
        confidence: 0.8
      };

      const result = await nlpService.generateSuggestions(context);

      expect(result).toHaveLength(2); // destination + budget
      expect(result.some(s => s.type === 'budget_planning')).toBe(true);
      expect(result.some(s => s.type === 'destination_info')).toBe(true);
    });

    it('should generate vote suggestions for vote requests', async () => {
      const context = {
        destinations: [],
        dates: [],
        budget: null,
        interests: [],
        preferences: {
          accommodation: [],
          transportation: [],
          activities: []
        },
        mentions: {
          restaurants: ['Restaurant A', 'Restaurant B'],
          attractions: [],
          hotels: []
        },
        intent: 'vote_request' as const,
        confidence: 0.9
      };

      const result = await nlpService.generateSuggestions(context);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('create_vote');
      expect(result[0].priority).toBe('medium');
    });

    it('should not generate suggestions for low confidence', async () => {
      const context = {
        destinations: ['Tokyo'],
        dates: [],
        budget: null,
        interests: [],
        preferences: {
          accommodation: [],
          transportation: [],
          activities: []
        },
        mentions: {
          restaurants: [],
          attractions: [],
          hotels: []
        },
        intent: 'suggestion' as const,
        confidence: 0.3 // Low confidence
      };

      const result = await nlpService.generateSuggestions(context);

      expect(result).toEqual([]);
    });
  });

  describe('generateQuickResponse', () => {
    it('should generate a quick response for high confidence queries', async () => {
      const context = {
        destinations: ['Tokyo'],
        dates: [],
        budget: null,
        interests: ['food'],
        preferences: {
          accommodation: [],
          transportation: [],
          activities: []
        },
        mentions: {
          restaurants: [],
          attractions: [],
          hotels: []
        },
        intent: 'question' as const,
        confidence: 0.8
      };

      const mockResponse = {
        choices: [{
          message: {
            content: 'Tokyo is a great destination for food lovers! I can help you find the best restaurants and food experiences there.'
          }
        }]
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await nlpService.generateQuickResponse('What are the best food places in Tokyo?', context);

      expect(result).toContain('Tokyo');
      expect(result).toContain('food');
    });

    it('should return null for low confidence', async () => {
      const context = {
        destinations: [],
        dates: [],
        budget: null,
        interests: [],
        preferences: {
          accommodation: [],
          transportation: [],
          activities: []
        },
        mentions: {
          restaurants: [],
          attractions: [],
          hotels: []
        },
        intent: 'general' as const,
        confidence: 0.3
      };

      const result = await nlpService.generateQuickResponse('Random message', context);

      expect(result).toBeNull();
    });

    it('should handle API errors', async () => {
      const context = {
        destinations: ['Tokyo'],
        dates: [],
        budget: null,
        interests: [],
        preferences: {
          accommodation: [],
          transportation: [],
          activities: []
        },
        mentions: {
          restaurants: [],
          attractions: [],
          hotels: []
        },
        intent: 'question' as const,
        confidence: 0.8
      };

      mockOpenAIClient.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await nlpService.generateQuickResponse('Test message', context);

      expect(result).toBeNull();
    });
  });

  describe('analyzeConversationSentiment', () => {
    it('should analyze conversation sentiment and engagement', async () => {
      const mockMessages = [
        { content: 'I love this trip idea!' },
        { content: 'Tokyo sounds amazing!' },
        { content: 'When should we book our flights?' }
      ] as any;

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              sentiment: 'positive',
              engagement: 'high',
              topics: ['trip planning', 'Tokyo', 'flights'],
              recommendations: ['Consider booking flights soon', 'Look into accommodation options']
            })
          }
        }]
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await nlpService.analyzeConversationSentiment(mockMessages);

      expect(result.sentiment).toBe('positive');
      expect(result.engagement).toBe('high');
      expect(result.topics).toEqual(['trip planning', 'Tokyo', 'flights']);
      expect(result.recommendations).toHaveLength(2);
    });

    it('should handle API errors and return defaults', async () => {
      mockOpenAIClient.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await nlpService.analyzeConversationSentiment([{ content: 'test' }] as any);

      expect(result.sentiment).toBe('neutral');
      expect(result.engagement).toBe('medium');
      expect(result.topics).toEqual([]);
      expect(result.recommendations).toEqual([]);
    });
  });
});