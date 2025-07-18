import { ExpenseRepository, Expense, CreateExpenseData, UpdateExpenseData, Budget, ExpenseSplit } from '../../../src/models/expense';
import { getDatabase } from '../../../src/config/database';

// Mock the database
jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(),
}));

const mockDb = {
  query: jest.fn(),
};

(getDatabase as jest.Mock).mockReturnValue(mockDb);

describe('ExpenseRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createExpense', () => {
    it('should create an expense successfully', async () => {
      const mockExpense: Expense = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tripId: 'trip-123',
        userId: 'user-123',
        payerId: 'user-123',
        title: 'Dinner at Restaurant',
        description: 'Team dinner',
        amount: 150.00,
        currency: 'USD',
        baseAmount: 150.00,
        baseCurrency: 'USD',
        exchangeRate: 1.0,
        category: 'dining',
        subcategory: 'restaurant',
        tags: ['team', 'dinner'],
        expenseDate: new Date('2025-07-18'),
        location: {
          lat: 40.7128,
          lng: -74.0060,
          address: '123 Restaurant St, New York, NY'
        },
        participants: ['user-123', 'user-456'],
        splitMethod: 'equal',
        splitData: { 'user-123': 75, 'user-456': 75 },
        receiptUrls: ['https://example.com/receipt.jpg'],
        status: 'active',
        verificationStatus: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockExpense] });

      const expenseData: CreateExpenseData = {
        tripId: 'trip-123',
        userId: 'user-123',
        payerId: 'user-123',
        title: 'Dinner at Restaurant',
        description: 'Team dinner',
        amount: 150.00,
        currency: 'USD',
        category: 'dining',
        subcategory: 'restaurant',
        tags: ['team', 'dinner'],
        expenseDate: new Date('2025-07-18'),
        participants: ['user-123', 'user-456'],
        splitMethod: 'equal',
        splitData: { 'user-123': 75, 'user-456': 75 },
        receiptUrls: ['https://example.com/receipt.jpg'],
      };

      const result = await ExpenseRepository.createExpense(expenseData);

      expect(result).toEqual(mockExpense);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO expenses'),
        expect.arrayContaining([
          expenseData.tripId,
          expenseData.userId,
          expenseData.payerId,
          expenseData.title,
          expenseData.description,
          expenseData.amount,
          expenseData.currency,
          expenseData.category,
        ])
      );
    });
  });

  describe('getExpenseById', () => {
    it('should find an expense by id', async () => {
      const mockExpense: Expense = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tripId: 'trip-123',
        userId: 'user-123',
        payerId: 'user-123',
        title: 'Hotel Booking',
        amount: 300.00,
        currency: 'USD',
        baseAmount: 300.00,
        baseCurrency: 'USD',
        exchangeRate: 1.0,
        category: 'accommodation',
        tags: [],
        expenseDate: new Date('2025-07-18'),
        participants: ['user-123'],
        splitMethod: 'equal',
        splitData: {},
        receiptUrls: [],
        status: 'active',
        verificationStatus: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockExpense] });

      const result = await ExpenseRepository.getExpenseById('123e4567-e89b-12d3-a456-426614174000');

      expect(result).toEqual(mockExpense);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM expenses WHERE id = $1'),
        ['123e4567-e89b-12d3-a456-426614174000']
      );
    });

    it('should return null if expense not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await ExpenseRepository.getExpenseById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('getExpensesByTripId', () => {
    it('should find expenses by trip id', async () => {
      const mockExpenses: Expense[] = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          tripId: 'trip-123',
          userId: 'user-123',
          payerId: 'user-123',
          title: 'Lunch',
          amount: 50.00,
          currency: 'USD',
          baseAmount: 50.00,
          baseCurrency: 'USD',
          exchangeRate: 1.0,
          category: 'dining',
          tags: [],
          expenseDate: new Date('2025-07-18'),
          participants: ['user-123'],
          splitMethod: 'equal',
          splitData: {},
          receiptUrls: [],
          status: 'active',
          verificationStatus: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ];

      mockDb.query.mockResolvedValueOnce({ rows: mockExpenses });

      const result = await ExpenseRepository.getExpensesByTripId('trip-123');

      expect(result).toEqual(mockExpenses);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM expenses WHERE trip_id = $1'),
        ['trip-123']
      );
    });
  });

  describe('getTripExpenseSummary', () => {
    it('should calculate trip totals correctly', async () => {
      const mockResult = {
        rows: [{
          totalAmount: '225.00',
          totalCount: 3,
          totalSpent: '225.00',
          categoryBreakdown: JSON.stringify({
            dining: { total: 125.00, count: 2 },
            transportation: { total: 100.00, count: 1 }
          })
        }]
      };

      mockDb.query.mockResolvedValueOnce(mockResult);

      const result = await ExpenseRepository.getTripExpenseSummary('trip-123');

      expect(result).toBeDefined();
      expect(result?.totalAmount).toBe(225.00);
      expect(result?.totalCount).toBe(3);
    });
  });

  describe('getUserBalances', () => {
    it('should calculate user balance correctly', async () => {
      const mockResult = {
        rows: [{
          userId: 'user-123',
          totalPaid: '200.00',
          totalOwed: '150.00'
        }]
      };

      mockDb.query.mockResolvedValueOnce(mockResult);

      const result = await ExpenseRepository.getUserBalances('trip-123');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-123');
      expect(result[0].totalPaid).toBe(200.00);
      expect(result[0].totalOwed).toBe(150.00);
    });
  });

  describe('Budget operations', () => {
    describe('createBudget', () => {
      it('should create a budget successfully', async () => {
        const mockBudget: Budget = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          tripId: 'trip-123',
          totalAmount: 1000.00,
          currency: 'USD',
          categoryLimits: {
            dining: 300.00,
            accommodation: 500.00,
            transportation: 200.00
          },
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockDb.query.mockResolvedValueOnce({ rows: [mockBudget] });

        const budgetData = {
          tripId: 'trip-123',
          totalAmount: 1000.00,
          currency: 'USD',
          categoryLimits: {
            dining: 300.00,
            accommodation: 500.00,
            transportation: 200.00
          },
          createdBy: 'user-123',
        };

        const result = await ExpenseRepository.createBudget(budgetData);

        expect(result).toEqual(mockBudget);
      });
    });
  });

  describe('updateExpense', () => {
    it('should update an expense successfully', async () => {
      const mockUpdatedExpense: Expense = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tripId: 'trip-123',
        userId: 'user-123',
        payerId: 'user-123',
        title: 'Updated Dinner',
        description: 'Updated description',
        amount: 175.00,
        currency: 'USD',
        baseAmount: 175.00,
        baseCurrency: 'USD',
        exchangeRate: 1.0,
        category: 'dining',
        tags: [],
        expenseDate: new Date('2025-07-18'),
        participants: ['user-123'],
        splitMethod: 'equal',
        splitData: {},
        receiptUrls: [],
        status: 'active',
        verificationStatus: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockUpdatedExpense] });

      const updateData: UpdateExpenseData = {
        title: 'Updated Dinner',
        description: 'Updated description',
        amount: 175.00,
      };

      const result = await ExpenseRepository.updateExpense('123e4567-e89b-12d3-a456-426614174000', updateData);

      expect(result).toEqual(mockUpdatedExpense);
    });
  });

  describe('deleteExpense', () => {
    it('should delete an expense successfully', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await ExpenseRepository.deleteExpense('123e4567-e89b-12d3-a456-426614174000');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        'DELETE FROM expenses WHERE id = $1',
        ['123e4567-e89b-12d3-a456-426614174000']
      );
    });

    it('should return false if expense not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await ExpenseRepository.deleteExpense('non-existent-id');

      expect(result).toBe(false);
    });
  });
});
