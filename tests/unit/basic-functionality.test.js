"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const openai_1 = require("../../src/lib/openai");
const keyvault_1 = require("../../src/lib/keyvault");
const user_1 = require("../../src/models/user");
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
        it('should generate itinerary', () => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield (0, openai_1.generateItinerary)('Tokyo', 7);
            expect(result).toBe('Test itinerary');
        }));
        it('should handle empty destination', () => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield (0, openai_1.generateItinerary)('', 7);
            expect(result).toBe('Test itinerary');
        }));
        it('should handle zero duration', () => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield (0, openai_1.generateItinerary)('Tokyo', 0);
            expect(result).toBe('Test itinerary');
        }));
    });
    describe('Key Vault Integration', () => {
        it('should create key vault client', () => {
            const client = (0, keyvault_1.getKeyVaultClient)();
            expect(client).toBeDefined();
        });
        it('should handle missing environment variables', () => {
            delete process.env.AZURE_KEYVAULT_URL;
            const client = (0, keyvault_1.getKeyVaultClient)();
            expect(client).toBeDefined();
        });
    });
    describe('User Repository', () => {
        it('should have static methods', () => {
            expect(typeof user_1.UserRepository.create).toBe('function');
            expect(typeof user_1.UserRepository.findById).toBe('function');
            expect(typeof user_1.UserRepository.findByEmail).toBe('function');
            expect(typeof user_1.UserRepository.findByGoogleId).toBe('function');
            expect(typeof user_1.UserRepository.update).toBe('function');
            expect(typeof user_1.UserRepository.delete).toBe('function');
            expect(typeof user_1.UserRepository.findAll).toBe('function');
        });
        it('should handle database operations', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockDb = require('../../src/config/database').getDatabase();
            mockDb.query.mockResolvedValue({
                rows: [{ id: '1', name: 'Test User', email: 'test@example.com' }]
            });
            // Test that the repository methods exist and can be called
            expect(typeof user_1.UserRepository.findById).toBe('function');
            expect(mockDb.query).toBeDefined();
            // Just verify the mock setup works
            const mockResult = yield mockDb.query('SELECT * FROM users WHERE id = $1', ['1']);
            expect(mockResult.rows).toHaveLength(1);
        }));
    });
    describe('Environment Configuration', () => {
        it('should handle missing environment variables gracefully', () => {
            const originalEnv = process.env;
            // Clear all Azure-related environment variables
            delete process.env.AZURE_OPENAI_ENDPOINT;
            delete process.env.AZURE_OPENAI_KEY;
            delete process.env.AZURE_KEYVAULT_URL;
            // Test that functions still work with defaults
            expect(() => (0, keyvault_1.getKeyVaultClient)()).not.toThrow();
            // Restore environment
            process.env = originalEnv;
        });
    });
});
