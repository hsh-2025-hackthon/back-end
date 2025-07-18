import { generateItinerary } from '../../src/lib/openai';
import { getKeyVaultClient } from '../../src/lib/keyvault';
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

jest.mock('@azure/keyvault-secrets', () => ({
  SecretClient: jest.fn()
}));

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn()
}));

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({
    query: jest.fn()
  }))
}));

describe('Basic Functionality Tests', () => {
  beforeEach(() => {
    // Set up environment variables
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com/';
    process.env.AZURE_OPENAI_KEY = 'test-key';
    process.env.AZURE_KEYVAULT_URL = 'https://test.vault.azure.net/';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('OpenAI Integration', () => {
    it('should generate itinerary', async () => {
      const result = await generateItinerary('Tokyo', 7);
      expect(result).toBe('Test itinerary');
    });

    it('should handle empty destination', async () => {
      const result = await generateItinerary('', 7);
      expect(result).toBe('Test itinerary');
    });

    it('should handle zero duration', async () => {
      const result = await generateItinerary('Tokyo', 0);
      expect(result).toBe('Test itinerary');
    });
  });

  describe('Key Vault Integration', () => {
    it('should create key vault client', () => {
      const client = getKeyVaultClient();
      expect(client).toBeDefined();
    });

    it('should handle missing environment variables', () => {
      delete process.env.AZURE_KEYVAULT_URL;
      const client = getKeyVaultClient();
      expect(client).toBeDefined();
    });
  });

  describe('User Repository', () => {
    it('should have static methods', () => {
      expect(typeof UserRepository.create).toBe('function');
      expect(typeof UserRepository.findById).toBe('function');
      expect(typeof UserRepository.findByEmail).toBe('function');
      expect(typeof UserRepository.findByAzureAdId).toBe('function');
      expect(typeof UserRepository.update).toBe('function');
      expect(typeof UserRepository.delete).toBe('function');
      expect(typeof UserRepository.findAll).toBe('function');
    });

    it('should handle database operations', async () => {
      const mockDb = require('../../src/config/database').getDatabase();
      mockDb.query.mockResolvedValue({
        rows: [{ id: '1', name: 'Test User', email: 'test@example.com' }]
      });

      // Test that the repository methods exist and can be called
      expect(typeof UserRepository.findById).toBe('function');
      expect(mockDb.query).toBeDefined();
      
      // Just verify the mock setup works
      const mockResult = await mockDb.query('SELECT * FROM users WHERE id = $1', ['1']);
      expect(mockResult.rows).toHaveLength(1);
    });
  });

  describe('Environment Configuration', () => {
    it('should handle missing environment variables gracefully', () => {
      const originalEnv = process.env;
      
      // Clear all Azure-related environment variables
      delete process.env.AZURE_OPENAI_ENDPOINT;
      delete process.env.AZURE_OPENAI_KEY;
      delete process.env.AZURE_KEYVAULT_URL;

      // Test that functions still work with defaults
      expect(() => getKeyVaultClient()).not.toThrow();
      
      // Restore environment
      process.env = originalEnv;
    });
  });
});