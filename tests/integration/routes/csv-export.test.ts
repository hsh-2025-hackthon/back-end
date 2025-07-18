import request from 'supertest';
import express from 'express';
import expensesRouter from '../../../src/api/routes/expenses';

// Mock dependencies
jest.mock('../../../src/models/expense');
jest.mock('../../../src/models/trip');
jest.mock('../../../src/api/middleware/auth');

describe('CSV Export Routes', () => {
  let app: express.Application;
  let tripId: string;
  let userId: string;

  beforeAll(async () => {
    // Create test app
    app = express();
    app.use(express.json());
    app.use('/api', expensesRouter);
    
    tripId = '123e4567-e89b-12d3-a456-426614174000';
    userId = '123e4567-e89b-12d3-a456-426614174001';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/trips/:tripId/expenses/export/csv', () => {
    it('should require authentication', async () => {
      const { requireAuth } = require('../../../src/api/middleware/auth');
      requireAuth.mockImplementation((req: any, res: any, next: any) => {
        res.status(401).json({ message: 'Unauthorized' });
      });

      const response = await request(app)
        .get(`/api/trips/${tripId}/expenses/export/csv`)
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should return CSV content when authenticated and has access', async () => {
      const { requireAuth } = require('../../../src/api/middleware/auth');
      const { TripRepository } = require('../../../src/models/trip');
      const { ExpenseRepository } = require('../../../src/models/expense');

      // Mock auth middleware
      requireAuth.mockImplementation((req: any, res: any, next: any) => {
        req.user = { id: userId };
        next();
      });

      // Mock TripRepository.checkTripAccess
      TripRepository.checkTripAccess = jest.fn().mockResolvedValue(true);

      // Mock ExpenseRepository.findExpensesByTripId
      ExpenseRepository.findExpensesByTripId = jest.fn().mockResolvedValue({
        expenses: [
          {
            id: '1',
            tripId,
            title: 'Test Expense',
            description: 'Test Description',
            amount: 100,
            currency: 'USD',
            baseAmount: 100,
            baseCurrency: 'USD',
            category: 'Food',
            subcategory: 'Restaurant',
            expenseDate: new Date('2025-07-19'),
            splitMethod: 'equal',
            participants: [userId],
            status: 'active',
            verificationStatus: 'verified',
            tags: ['dinner'],
            location: { address: 'Test Location' }
          }
        ],
        total: 1
      });

      const response = await request(app)
        .get(`/api/trips/${tripId}/expenses/export/csv`)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('.csv');
      expect(response.text).toContain('Date,Title,Description,Amount');
      expect(response.text).toContain('Test Expense');
    });

    it('should return 403 when user has no access to trip', async () => {
      const { requireAuth } = require('../../../src/api/middleware/auth');
      const { TripRepository } = require('../../../src/models/trip');

      // Mock auth middleware
      requireAuth.mockImplementation((req: any, res: any, next: any) => {
        req.user = { id: userId };
        next();
      });

      // Mock TripRepository.checkTripAccess to return false
      TripRepository.checkTripAccess = jest.fn().mockResolvedValue(false);

      const response = await request(app)
        .get(`/api/trips/${tripId}/expenses/export/csv`)
        .expect(403);

      expect(response.body).toHaveProperty('message', 'Access denied');
    });
  });
});
