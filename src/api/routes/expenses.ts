import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { ExpenseRepository, CreateExpenseData, UpdateExpenseData, CreateBudgetData } from '../../models/expense';
import { TripRepository } from '../../models/trip';
import { z } from 'zod';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateExpenseSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  category: z.string().min(1),
  subcategory: z.string().optional(),
  tags: z.array(z.string()).optional(),
  expenseDate: z.string().refine(date => !isNaN(Date.parse(date))),
  expenseTime: z.string().optional(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string(),
    placeId: z.string().optional()
  }).optional(),
  participants: z.array(z.string().uuid()),
  splitMethod: z.enum(['equal', 'percentage', 'custom', 'shares', 'none']).optional(),
  splitData: z.record(z.string(), z.number()).optional(),
  payerId: z.string().uuid().optional(),
  receiptUrls: z.array(z.string().url()).optional()
});

const UpdateExpenseSchema = CreateExpenseSchema.partial();

const CreateBudgetSchema = z.object({
  category: z.string().optional(),
  totalAmount: z.number().positive(),
  currency: z.string().length(3),
  alertThresholds: z.object({
    warning: z.number().min(0).max(1),
    critical: z.number().min(0).max(1)
  }).optional()
});

const ExpenseFiltersSchema = z.object({
  category: z.string().optional(),
  dateFrom: z.string().refine(date => !isNaN(Date.parse(date))).optional(),
  dateTo: z.string().refine(date => !isNaN(Date.parse(date))).optional(),
  payerId: z.string().uuid().optional(),
  participantId: z.string().uuid().optional(),
  status: z.enum(['active', 'cancelled', 'merged']).optional(),
  tags: z.string().optional(), // comma-separated tags
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  offset: z.string().regex(/^\d+$/).transform(Number).optional(),
  sortBy: z.enum(['date_desc', 'date_asc', 'amount_desc', 'amount_asc']).optional(),
  includeSplits: z.string().regex(/^(true|false)$/).transform(val => val === 'true').optional()
});

// ============================================================================
// Helper Functions
// ============================================================================

// Helper function to check trip access
async function checkTripAccess(tripId: string, userId: string): Promise<boolean> {
  return TripRepository.checkTripAccess(tripId, userId);
}

// ============================================================================
// Budget Management
// ============================================================================

/**
 * GET /api/trips/:tripId/budget
 * Get trip budget information
 */
router.get('/trips/:tripId/budget', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    
    // Check access
    const hasAccess = await checkTripAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const budgets = await ExpenseRepository.getBudgetsByTripId(tripId);
    const summary = await ExpenseRepository.getExpenseSummary(tripId);
    
    const totalBudget = budgets.find(b => !b.category);
    const categoryBudgets = budgets.filter(b => b.category);
    
    res.json({
      totalBudget,
      categoryBudgets,
      summary
    });
  } catch (error) {
    console.error('Error fetching budget:', error);
    res.status(500).json({ message: 'Failed to fetch budget' });
  }
});

/**
 * PUT /api/trips/:tripId/budget
 * Create or update trip budget
 */
router.put('/trips/:tripId/budget', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const budgetData = CreateBudgetSchema.parse(req.body);
    
    // Check access
    const hasAccess = await checkTripAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const budget = await ExpenseRepository.createOrUpdateBudget({
      ...budgetData,
      tripId,
      createdBy: req.user!.id
    });
    
    res.json(budget);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid budget data', errors: error.issues });
    }
    console.error('Error updating budget:', error);
    res.status(500).json({ message: 'Failed to update budget' });
  }
});

// ============================================================================
// Expense Management
// ============================================================================

/**
 * GET /api/trips/:tripId/expenses
 * Get expenses for a trip
 */
router.get('/trips/:tripId/expenses', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const filters = ExpenseFiltersSchema.parse(req.query);
    
    // Check access
    const hasAccess = await checkTripAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Convert date strings to Date objects
    const processedFilters = {
      ...filters,
      dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
      dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
      tags: filters.tags ? filters.tags.split(',') : undefined
    };
    
    const { expenses, total } = await ExpenseRepository.findExpensesByTripId(tripId, processedFilters);
    
    // Include splits if requested
    if (filters.includeSplits) {
      for (const expense of expenses) {
        expense.splits = await ExpenseRepository.getExpenseSplits(tripId, { userId: undefined });
        expense.splits = expense.splits.filter(split => split.expenseId === expense.id);
      }
    }
    
    res.json({
      expenses,
      totalCount: total,
      hasMore: filters.offset ? (filters.offset + expenses.length) < total : expenses.length < total
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid filters', errors: error.issues });
    }
    console.error('Error fetching expenses:', error);
    res.status(500).json({ message: 'Failed to fetch expenses' });
  }
});

/**
 * POST /api/trips/:tripId/expenses
 * Create a new expense
 */
router.post('/trips/:tripId/expenses', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const expenseData = CreateExpenseSchema.parse(req.body);
    
    // Check access
    const hasAccess = await checkTripAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const expense = await ExpenseRepository.createExpense({
      ...expenseData,
      tripId,
      userId: req.user!.id,
      expenseDate: new Date(expenseData.expenseDate),
      payerId: expenseData.payerId || req.user!.id
    });
    
    // Broadcast to trip members via WebSocket
    const { broadcastToTrip } = await import('../../lib/webpubsub');
    await broadcastToTrip(tripId, {
      type: 'expense_created',
      data: expense
    });
    
    res.status(201).json(expense);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid expense data', errors: error.issues });
    }
    console.error('Error creating expense:', error);
    res.status(500).json({ message: 'Failed to create expense' });
  }
});

/**
 * GET /api/expenses/:expenseId
 * Get a specific expense
 */
router.get('/expenses/:expenseId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { expenseId } = req.params;
    
    const expense = await ExpenseRepository.findExpenseById(expenseId);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    // Check access to the trip
    const hasAccess = await checkTripAccess(expense.tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Include splits
    const splits = await ExpenseRepository.getExpenseSplits(expense.tripId, {});
    expense.splits = splits.filter(split => split.expenseId === expenseId);
    
    res.json(expense);
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({ message: 'Failed to fetch expense' });
  }
});

/**
 * PUT /api/expenses/:expenseId
 * Update an expense
 */
router.put('/expenses/:expenseId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { expenseId } = req.params;
    const updates = UpdateExpenseSchema.parse(req.body);
    
    const expense = await ExpenseRepository.findExpenseById(expenseId);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    // Check if user can edit (creator or trip owner)
    const hasAccess = await checkTripAccess(expense.tripId, req.user!.id);
    const canEdit = hasAccess && (expense.userId === req.user!.id || expense.payerId === req.user!.id);
    if (!canEdit) {
      return res.status(403).json({ message: 'Cannot edit this expense' });
    }
    
    // Process date conversion
    const processedUpdates = {
      ...updates,
      expenseDate: updates.expenseDate ? new Date(updates.expenseDate) : undefined
    };
    
    const updatedExpense = await ExpenseRepository.updateExpense(expenseId, processedUpdates);
    
    // Broadcast update
    const { broadcastToTrip } = await import('../../lib/webpubsub');
    await broadcastToTrip(expense.tripId, {
      type: 'expense_updated',
      data: updatedExpense
    });
    
    res.json(updatedExpense);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid update data', errors: error.issues });
    }
    console.error('Error updating expense:', error);
    res.status(500).json({ message: 'Failed to update expense' });
  }
});

/**
 * DELETE /api/expenses/:expenseId
 * Delete an expense
 */
router.delete('/expenses/:expenseId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { expenseId } = req.params;
    
    const expense = await ExpenseRepository.findExpenseById(expenseId);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    // Check if user can delete (creator or trip owner)
    const hasAccess = await checkTripAccess(expense.tripId, req.user!.id);
    const canDelete = hasAccess && (expense.userId === req.user!.id || expense.payerId === req.user!.id);
    if (!canDelete) {
      return res.status(403).json({ message: 'Cannot delete this expense' });
    }
    
    await ExpenseRepository.deleteExpense(expenseId);
    
    // Broadcast deletion
    const { broadcastToTrip } = await import('../../lib/webpubsub');
    await broadcastToTrip(expense.tripId, {
      type: 'expense_deleted',
      data: { expenseId }
    });
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ message: 'Failed to delete expense' });
  }
});

// ============================================================================
// Expense Splits Management
// ============================================================================

/**
 * GET /api/trips/:tripId/splits
 * Get expense splits for a trip
 */
router.get('/trips/:tripId/splits', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const { userId, status, includeSettled } = req.query;
    
    // Check access
    const hasAccess = await checkTripAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const splits = await ExpenseRepository.getExpenseSplits(tripId, {
      userId: userId as string,
      status: status as string
    });
    
    const balances = await ExpenseRepository.getUserBalances(tripId);
    
    res.json({
      splits,
      balances,
      settlementSuggestions: [] // TODO: Implement settlement suggestions
    });
  } catch (error) {
    console.error('Error fetching splits:', error);
    res.status(500).json({ message: 'Failed to fetch splits' });
  }
});

/**
 * POST /api/expense-splits/:splitId/acknowledge
 * Acknowledge an expense split
 */
router.post('/expense-splits/:splitId/acknowledge', requireAuth, async (req: Request, res: Response) => {
  try {
    const { splitId } = req.params;
    
    // TODO: Add proper authorization check for the split
    
    await ExpenseRepository.updateSplitStatus(splitId, 'acknowledged');
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error acknowledging split:', error);
    res.status(500).json({ message: 'Failed to acknowledge split' });
  }
});

/**
 * POST /api/expense-splits/:splitId/mark-paid
 * Mark a split as paid
 */
router.post('/expense-splits/:splitId/mark-paid', requireAuth, async (req: Request, res: Response) => {
  try {
    const { splitId } = req.params;
    const { paymentMethod, paymentReference, notes } = req.body;
    
    // TODO: Add proper authorization check for the split
    
    await ExpenseRepository.updateSplitStatus(splitId, 'paid', {
      paymentMethod,
      paymentReference,
      notes
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking split as paid:', error);
    res.status(500).json({ message: 'Failed to mark split as paid' });
  }
});

// ============================================================================
// Analytics and Reports
// ============================================================================

/**
 * GET /api/trips/:tripId/expenses/summary
 * Get expense summary and analytics
 */
router.get('/trips/:tripId/expenses/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    
    // Check access
    const hasAccess = await checkTripAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const summary = await ExpenseRepository.getExpenseSummary(tripId);
    const balances = await ExpenseRepository.getUserBalances(tripId);
    
    res.json({
      summary,
      balances
    });
  } catch (error) {
    console.error('Error fetching expense summary:', error);
    res.status(500).json({ message: 'Failed to fetch expense summary' });
  }
});

export default router;
