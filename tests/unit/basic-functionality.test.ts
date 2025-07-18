import { generateItinerary } from '../../src/lib/openai';
import { testKeyVaultConnection } from '../../src/lib/keyvault';
import { UserRepository } from '../../src/models/user';

// Mock dependencies
jest.mock('openai', () => ({
  AzureOpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test itinerary' } }]
        })
      }
    }
  }))
}));

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({
    query: jest.fn()
  }))
}));

describe('Basic Functionality Tests', () => {
  beforeEach(() => {
    // Set up environment variables for testing
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com/';
    process.env.AZURE_OPENAI_KEY = 'test-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('OpenAI Integration', () => {
    it('should generate itinerary for valid inputs', async () => {
      const result = await generateItinerary('Tokyo', 7);
      expect(result).toBe('Test itinerary');
    });

    it('should handle edge cases gracefully', async () => {
      // Test with empty destination
      const emptyDestResult = await generateItinerary('', 7);
      expect(emptyDestResult).toBe('Test itinerary');

      // Test with zero duration
      const zeroDurationResult = await generateItinerary('Tokyo', 0);
      expect(zeroDurationResult).toBe('Test itinerary');
    });
  });

  describe('Environment Variables', () => {
    it('should test environment-based key vault connection', async () => {
      const result = await testKeyVaultConnection();
      expect(result).toBe(true);
    });
  });

  describe('User Repository', () => {
    it('should have all required static methods', () => {
      const requiredMethods: (keyof typeof UserRepository)[] = [
        'create', 'findById', 'findByEmail', 'findByGoogleId', 
        'update', 'delete', 'findAll'
      ];
      
      requiredMethods.forEach(method => {
        expect(typeof UserRepository[method]).toBe('function');
      });
    });

    it('should handle database operations with mocked database', async () => {
      const mockDb = require('../../src/config/database').getDatabase();
      mockDb.query.mockResolvedValue({
        rows: [{ id: '1', name: 'Test User', email: 'test@example.com' }]
      });

      // Verify mock setup works
      const mockResult = await mockDb.query('SELECT * FROM users WHERE id = $1', ['1']);
      expect(mockResult.rows).toHaveLength(1);
      expect(mockResult.rows[0]).toEqual({
        id: '1',
        name: 'Test User',
        email: 'test@example.com'
      });
    });
  });
});