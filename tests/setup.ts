import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment defaults
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'test_db';
process.env.DB_USER = process.env.DB_USER || 'test_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test_password';

// Mock Azure services for unit tests
jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({
    getToken: jest.fn().mockResolvedValue({ token: 'mock-token' })
  }))
}));

// Global test timeout
jest.setTimeout(30000);

// Clean up after tests
afterAll(async () => {
  // Close any open connections
  await new Promise(resolve => setTimeout(resolve, 100));
});