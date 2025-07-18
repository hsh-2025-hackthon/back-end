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
const dotenv_1 = require("dotenv");
// Load test environment variables
(0, dotenv_1.config)({ path: '.env.test' });
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
afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
    // Close any open connections
    yield new Promise(resolve => setTimeout(resolve, 100));
}));
