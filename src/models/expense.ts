import { getDatabase } from '../config/database';
import { User } from './user';

export interface Expense {
  id: string;
  tripId: string;
  userId: string;
  payerId: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  baseAmount: number;
  baseCurrency: string;
  exchangeRate: number;
  category: string;
  subcategory?: string;
  tags: string[];
  expenseDate: Date;
  expenseTime?: string;
  location?: {
    lat: number;
    lng: number;
    address: string;
    placeId?: string;
  };
  participants: string[];
  splitMethod: 'equal' | 'percentage' | 'custom' | 'shares' | 'none';
  splitData: Record<string, number>;
  receiptUrls: string[];
  ocrData?: ReceiptOCRData;
  status: 'active' | 'cancelled' | 'merged';
  verificationStatus: 'pending' | 'verified' | 'disputed';
  createdAt: Date;
  updatedAt: Date;

  // Optional relations
  user?: User;
  payer?: User;
  splits?: ExpenseSplit[];
}

export interface ExpenseSplit {
  id: string;
  expenseId: string;
  userId: string;
  payerId: string;
  amount: number;
  currency: string;
  baseAmount: number;
  baseCurrency: string;
  status: 'pending' | 'acknowledged' | 'paid' | 'cancelled';
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;

  // Optional relations
  user?: User;
  payer?: User;
  expense?: Expense;
}

export interface Budget {
  id: string;
  tripId: string;
  category?: string;
  totalAmount: number;
  currency: string;
  spentAmount: number;
  allocatedAmount: number;
  alertThresholds: {
    warning: number;
    critical: number;
  };
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;

  // Optional relations
  creator?: User;
}

export interface Settlement {
  id: string;
  tripId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  baseAmount: number;
  baseCurrency: string;
  method?: string;
  reference?: string;
  notes?: string;
  status: 'pending' | 'completed' | 'cancelled';
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Optional relations
  fromUser?: User;
  toUser?: User;
}

export interface ReceiptOCRData {
  merchant: string;
  total: number;
  currency: string;
  date: Date;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  tax: number;
  confidence: number;
  rawText: string;
}

export interface CreateExpenseData {
  tripId: string;
  userId: string;
  payerId?: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  category: string;
  subcategory?: string;
  tags?: string[];
  expenseDate: Date;
  expenseTime?: string;
  location?: Expense['location'];
  participants: string[];
  splitMethod?: Expense['splitMethod'];
  splitData?: Record<string, number>;
  receiptUrls?: string[];
  ocrData?: ReceiptOCRData;
}

export interface UpdateExpenseData {
  title?: string;
  description?: string;
  amount?: number;
  currency?: string;
  category?: string;
  subcategory?: string;
  tags?: string[];
  expenseDate?: Date;
  expenseTime?: string;
  location?: Expense['location'];
  participants?: string[];
  splitMethod?: Expense['splitMethod'];
  splitData?: Record<string, number>;
  receiptUrls?: string[];
  ocrData?: ReceiptOCRData;
  status?: Expense['status'];
  verificationStatus?: Expense['verificationStatus'];
}

export interface CreateBudgetData {
  tripId: string;
  category?: string;
  totalAmount: number;
  currency: string;
  alertThresholds?: Budget['alertThresholds'];
  createdBy: string;
}

export interface UpdateBudgetData {
  totalAmount?: number;
  currency?: string;
  alertThresholds?: Budget['alertThresholds'];
}

export interface ExpenseFilters {
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
  payerId?: string;
  participantId?: string;
  status?: Expense['status'];
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
}

export interface ExpenseSummary {
  totalExpenses: number;
  totalAmount: number;
  currency: string;
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    count: number;
  }>;
  userBreakdown: Array<{
    userId: string;
    userName: string;
    spent: number;
    owes: number;
    balance: number;
  }>;
}

export interface UserBalance {
  userId: string;
  userName: string;
  totalSpent: number;
  totalOwes: number;
  netBalance: number;
  settlements: Array<{
    withUserId: string;
    withUserName: string;
    amount: number;
    direction: 'owes' | 'owed';
  }>;
}

export class ExpenseRepository {
  // ============================================================================
  // Expense Operations
  // ============================================================================

  static async createExpense(data: CreateExpenseData): Promise<Expense> {
    const db = getDatabase();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Get trip's base currency for conversion
      const tripQuery = `SELECT base_currency FROM trips WHERE id = $1`;
      const tripResult = await client.query(tripQuery, [data.tripId]);
      const baseCurrency = tripResult.rows[0]?.base_currency || 'USD';

      // Calculate exchange rate and base amount (simplified - in real app, use currency service)
      const exchangeRate = data.currency === baseCurrency ? 1 : 1.0; // TODO: Use real currency service
      const baseAmount = data.amount * exchangeRate;

      const expenseQuery = `
        INSERT INTO expenses (
          trip_id, user_id, payer_id, title, description, amount, currency, 
          base_amount, base_currency, exchange_rate, category, subcategory, 
          tags, expense_date, expense_time, location, participants, 
          split_method, split_data, receipt_urls, ocr_data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING id, trip_id as "tripId", user_id as "userId", payer_id as "payerId", 
                  title, description, amount, currency, base_amount as "baseAmount", 
                  base_currency as "baseCurrency", exchange_rate as "exchangeRate", 
                  category, subcategory, tags, expense_date as "expenseDate", 
                  expense_time as "expenseTime", location, participants, split_method as "splitMethod", 
                  split_data as "splitData", receipt_urls as "receiptUrls", ocr_data as "ocrData",
                  status, verification_status as "verificationStatus", created_at as "createdAt", updated_at as "updatedAt"
      `;

      const expenseResult = await client.query(expenseQuery, [
        data.tripId,
        data.userId,
        data.payerId || data.userId,
        data.title,
        data.description,
        data.amount,
        data.currency,
        baseAmount,
        baseCurrency,
        exchangeRate,
        data.category,
        data.subcategory,
        JSON.stringify(data.tags || []),
        data.expenseDate,
        data.expenseTime,
        data.location ? JSON.stringify(data.location) : null,
        JSON.stringify(data.participants),
        data.splitMethod || 'equal',
        JSON.stringify(data.splitData || {}),
        JSON.stringify(data.receiptUrls || []),
        data.ocrData ? JSON.stringify(data.ocrData) : null
      ]);

      const expense = expenseResult.rows[0];

      // Create expense splits
      if (data.participants.length > 0) {
        await this.createExpenseSplits(client, expense.id, expense, data.participants);
      }

      // Update budget spent amount
      await this.updateBudgetSpentAmount(client, data.tripId, data.category, baseAmount);

      await client.query('COMMIT');
      return expense;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findExpensesByTripId(tripId: string, filters: ExpenseFilters = {}): Promise<{ expenses: Expense[], total: number }> {
    const db = getDatabase();
    let query = `
      SELECT e.id, e.trip_id as "tripId", e.user_id as "userId", e.payer_id as "payerId",
             e.title, e.description, e.amount, e.currency, e.base_amount as "baseAmount",
             e.base_currency as "baseCurrency", e.exchange_rate as "exchangeRate",
             e.category, e.subcategory, e.tags, e.expense_date as "expenseDate",
             e.expense_time as "expenseTime", e.location, e.participants,
             e.split_method as "splitMethod", e.split_data as "splitData",
             e.receipt_urls as "receiptUrls", e.ocr_data as "ocrData",
             e.status, e.verification_status as "verificationStatus",
             e.created_at as "createdAt", e.updated_at as "updatedAt",
             u.name as "userName", p.name as "payerName"
      FROM expenses e
      JOIN users u ON e.user_id = u.id
      JOIN users p ON e.payer_id = p.id
      WHERE e.trip_id = $1
    `;

    const params: any[] = [tripId];
    let paramIndex = 2;

    // Apply filters
    if (filters.category) {
      query += ` AND e.category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    if (filters.dateFrom) {
      query += ` AND e.expense_date >= $${paramIndex}`;
      params.push(filters.dateFrom);
      paramIndex++;
    }

    if (filters.dateTo) {
      query += ` AND e.expense_date <= $${paramIndex}`;
      params.push(filters.dateTo);
      paramIndex++;
    }

    if (filters.payerId) {
      query += ` AND e.payer_id = $${paramIndex}`;
      params.push(filters.payerId);
      paramIndex++;
    }

    if (filters.participantId) {
      query += ` AND e.participants @> $${paramIndex}`;
      params.push(JSON.stringify([filters.participantId]));
      paramIndex++;
    }

    if (filters.status) {
      query += ` AND e.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.tags && filters.tags.length > 0) {
      query += ` AND e.tags && $${paramIndex}`;
      params.push(JSON.stringify(filters.tags));
      paramIndex++;
    }

    // Add sorting
    const sortBy = filters.sortBy || 'date_desc';
    switch (sortBy) {
      case 'date_asc':
        query += ` ORDER BY e.expense_date ASC, e.created_at ASC`;
        break;
      case 'amount_desc':
        query += ` ORDER BY e.base_amount DESC`;
        break;
      case 'amount_asc':
        query += ` ORDER BY e.base_amount ASC`;
        break;
      default:
        query += ` ORDER BY e.expense_date DESC, e.created_at DESC`;
    }

    // Get total count
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM').split('ORDER BY')[0];
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
      paramIndex++;
    }

    const result = await db.query(query, params);
    const expenses = result.rows.map(row => ({
      ...row,
      tags: row.tags,
      location: row.location,
      participants: row.participants,
      splitData: row.splitData,
      receiptUrls: row.receiptUrls,
      ocrData: row.ocrData,
      user: { id: row.userId, name: row.userName },
      payer: { id: row.payerId, name: row.payerName }
    }));

    return { expenses, total };
  }

  static async findExpenseById(expenseId: string): Promise<Expense | null> {
    const db = getDatabase();
    const query = `
      SELECT e.id, e.trip_id as "tripId", e.user_id as "userId", e.payer_id as "payerId",
             e.title, e.description, e.amount, e.currency, e.base_amount as "baseAmount",
             e.base_currency as "baseCurrency", e.exchange_rate as "exchangeRate",
             e.category, e.subcategory, e.tags, e.expense_date as "expenseDate",
             e.expense_time as "expenseTime", e.location, e.participants,
             e.split_method as "splitMethod", e.split_data as "splitData",
             e.receipt_urls as "receiptUrls", e.ocr_data as "ocrData",
             e.status, e.verification_status as "verificationStatus",
             e.created_at as "createdAt", e.updated_at as "updatedAt",
             u.name as "userName", p.name as "payerName"
      FROM expenses e
      JOIN users u ON e.user_id = u.id
      JOIN users p ON e.payer_id = p.id
      WHERE e.id = $1
    `;

    const result = await db.query(query, [expenseId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...row,
      tags: row.tags,
      location: row.location,
      participants: row.participants,
      splitData: row.splitData,
      receiptUrls: row.receiptUrls,
      ocrData: row.ocrData,
      user: { id: row.userId, name: row.userName },
      payer: { id: row.payerId, name: row.payerName }
    };
  }

  static async updateExpense(expenseId: string, updates: UpdateExpenseData): Promise<Expense> {
    const db = getDatabase();
    const fields = [];
    const values = [];
    let paramIndex = 1;

    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (['tags', 'location', 'participants', 'split_data', 'receipt_urls', 'ocr_data'].includes(dbField)) {
          fields.push(`${dbField} = $${paramIndex++}`);
          values.push(JSON.stringify(value));
        } else {
          fields.push(`${dbField} = $${paramIndex++}`);
          values.push(value);
        }
      }
    });

    fields.push(`updated_at = NOW()`);
    values.push(expenseId);

    const query = `
      UPDATE expenses SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, trip_id as "tripId", user_id as "userId", payer_id as "payerId",
                title, description, amount, currency, base_amount as "baseAmount",
                base_currency as "baseCurrency", exchange_rate as "exchangeRate",
                category, subcategory, tags, expense_date as "expenseDate",
                expense_time as "expenseTime", location, participants,
                split_method as "splitMethod", split_data as "splitData",
                receipt_urls as "receiptUrls", ocr_data as "ocrData",
                status, verification_status as "verificationStatus",
                created_at as "createdAt", updated_at as "updatedAt"
    `;

    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async deleteExpense(expenseId: string): Promise<void> {
    const db = getDatabase();
    await db.query('DELETE FROM expenses WHERE id = $1', [expenseId]);
  }

  // ============================================================================
  // Expense Split Operations
  // ============================================================================

  static async createExpenseSplits(client: any, expenseId: string, expense: Expense, participants: string[]): Promise<void> {
    const { splitMethod, splitData, amount } = expense;
    
    for (const participantId of participants) {
      let splitAmount = 0;

      switch (splitMethod) {
        case 'equal':
          splitAmount = amount / participants.length;
          break;
        case 'percentage':
          splitAmount = amount * ((splitData[participantId] || 0) / 100);
          break;
        case 'custom':
          splitAmount = splitData[participantId] || 0;
          break;
        case 'shares':
          const totalShares = Object.values(splitData).reduce((sum, share) => sum + (share as number), 0);
          splitAmount = amount * ((splitData[participantId] || 0) / totalShares);
          break;
        case 'none':
          splitAmount = participantId === expense.payerId ? amount : 0;
          break;
      }

      const splitQuery = `
        INSERT INTO expense_splits (expense_id, user_id, payer_id, amount, currency, base_amount, base_currency)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      await client.query(splitQuery, [
        expenseId,
        participantId,
        expense.payerId,
        splitAmount,
        expense.currency,
        splitAmount * expense.exchangeRate,
        expense.baseCurrency
      ]);
    }
  }

  static async getExpenseSplits(tripId: string, filters: { userId?: string, status?: string } = {}): Promise<ExpenseSplit[]> {
    const db = getDatabase();
    let query = `
      SELECT es.id, es.expense_id as "expenseId", es.user_id as "userId", es.payer_id as "payerId",
             es.amount, es.currency, es.base_amount as "baseAmount", es.base_currency as "baseCurrency",
             es.status, es.payment_method as "paymentMethod", es.payment_reference as "paymentReference",
             es.notes, es.created_at as "createdAt", es.updated_at as "updatedAt",
             u.name as "userName", p.name as "payerName", e.title as "expenseTitle"
      FROM expense_splits es
      JOIN users u ON es.user_id = u.id
      JOIN users p ON es.payer_id = p.id
      JOIN expenses e ON es.expense_id = e.id
      WHERE e.trip_id = $1
    `;

    const params: any[] = [tripId];
    let paramIndex = 2;

    if (filters.userId) {
      query += ` AND es.user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters.status) {
      query += ` AND es.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    query += ` ORDER BY es.created_at DESC`;

    const result = await db.query(query, params);
    return result.rows.map(row => ({
      ...row,
      user: { id: row.userId, name: row.userName },
      payer: { id: row.payerId, name: row.payerName },
      expense: { id: row.expenseId, title: row.expenseTitle }
    }));
  }

  static async updateSplitStatus(splitId: string, status: ExpenseSplit['status'], data?: { paymentMethod?: string, paymentReference?: string, notes?: string }): Promise<void> {
    const db = getDatabase();
    const query = `
      UPDATE expense_splits 
      SET status = $2, payment_method = $3, payment_reference = $4, notes = $5, updated_at = NOW()
      WHERE id = $1
    `;

    await db.query(query, [
      splitId,
      status,
      data?.paymentMethod,
      data?.paymentReference,
      data?.notes
    ]);
  }

  // ============================================================================
  // Budget Operations
  // ============================================================================

  static async createOrUpdateBudget(data: CreateBudgetData): Promise<Budget> {
    const db = getDatabase();
    const query = `
      INSERT INTO budgets (trip_id, category, total_amount, currency, alert_thresholds, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (trip_id, category) DO UPDATE SET
        total_amount = $3,
        currency = $4,
        alert_thresholds = $5,
        updated_at = NOW()
      RETURNING id, trip_id as "tripId", category, total_amount as "totalAmount", currency,
                spent_amount as "spentAmount", allocated_amount as "allocatedAmount",
                alert_thresholds as "alertThresholds", created_by as "createdBy",
                created_at as "createdAt", updated_at as "updatedAt"
    `;

    const result = await db.query(query, [
      data.tripId,
      data.category,
      data.totalAmount,
      data.currency,
      JSON.stringify(data.alertThresholds || { warning: 0.8, critical: 0.95 }),
      data.createdBy
    ]);

    return result.rows[0];
  }

  static async getBudgetsByTripId(tripId: string): Promise<Budget[]> {
    const db = getDatabase();
    const query = `
      SELECT id, trip_id as "tripId", category, total_amount as "totalAmount", currency,
             spent_amount as "spentAmount", allocated_amount as "allocatedAmount",
             alert_thresholds as "alertThresholds", created_by as "createdBy",
             created_at as "createdAt", updated_at as "updatedAt"
      FROM budgets
      WHERE trip_id = $1
      ORDER BY category NULLS FIRST, created_at ASC
    `;

    const result = await db.query(query, [tripId]);
    return result.rows.map(row => ({
      ...row,
      alertThresholds: row.alertThresholds
    }));
  }

  static async updateBudgetSpentAmount(client: any, tripId: string, category: string | undefined, amount: number): Promise<void> {
    // Update category budget
    if (category) {
      await client.query(`
        UPDATE budgets 
        SET spent_amount = spent_amount + $3, updated_at = NOW()
        WHERE trip_id = $1 AND category = $2
      `, [tripId, category, amount]);
    }

    // Update total budget
    await client.query(`
      UPDATE budgets 
      SET spent_amount = spent_amount + $2, updated_at = NOW()
      WHERE trip_id = $1 AND category IS NULL
    `, [tripId, amount]);
  }

  // ============================================================================
  // Summary and Analytics
  // ============================================================================

  static async getExpenseSummary(tripId: string): Promise<ExpenseSummary> {
    const db = getDatabase();

    // Get total expenses
    const totalQuery = `
      SELECT COUNT(*) as count, SUM(base_amount) as total, base_currency as currency
      FROM expenses
      WHERE trip_id = $1 AND status = 'active'
      GROUP BY base_currency
    `;
    const totalResult = await db.query(totalQuery, [tripId]);
    const { count = 0, total = 0, currency = 'USD' } = totalResult.rows[0] || {};

    // Get category breakdown
    const categoryQuery = `
      SELECT category, SUM(base_amount) as amount, COUNT(*) as count
      FROM expenses
      WHERE trip_id = $1 AND status = 'active'
      GROUP BY category
      ORDER BY amount DESC
    `;
    const categoryResult = await db.query(categoryQuery, [tripId]);

    // Get user breakdown (simplified)
    const userQuery = `
      SELECT u.id as "userId", u.name as "userName", 
             SUM(CASE WHEN e.payer_id = u.id THEN e.base_amount ELSE 0 END) as spent,
             SUM(es.base_amount) as owes
      FROM users u
      LEFT JOIN expenses e ON e.payer_id = u.id AND e.trip_id = $1 AND e.status = 'active'
      LEFT JOIN expense_splits es ON es.user_id = u.id AND es.expense_id IN (
        SELECT id FROM expenses WHERE trip_id = $1 AND status = 'active'
      )
      GROUP BY u.id, u.name
      HAVING SUM(CASE WHEN e.payer_id = u.id THEN e.base_amount ELSE 0 END) > 0 
          OR SUM(es.base_amount) > 0
    `;
    const userResult = await db.query(userQuery, [tripId]);

    return {
      totalExpenses: parseInt(count),
      totalAmount: parseFloat(total),
      currency,
      categoryBreakdown: categoryResult.rows,
      userBreakdown: userResult.rows.map(row => ({
        ...row,
        spent: parseFloat(row.spent || 0),
        owes: parseFloat(row.owes || 0),
        balance: parseFloat(row.spent || 0) - parseFloat(row.owes || 0)
      }))
    };
  }

  static async getUserBalances(tripId: string): Promise<UserBalance[]> {
    const db = getDatabase();
    
    // This is a simplified version - in a real app, you'd want more sophisticated balance calculation
    const query = `
      SELECT u.id as "userId", u.name as "userName",
             COALESCE(SUM(CASE WHEN e.payer_id = u.id THEN e.base_amount ELSE 0 END), 0) as "totalSpent",
             COALESCE(SUM(es.base_amount), 0) as "totalOwes"
      FROM users u
      LEFT JOIN expenses e ON e.payer_id = u.id AND e.trip_id = $1 AND e.status = 'active'
      LEFT JOIN expense_splits es ON es.user_id = u.id AND es.expense_id IN (
        SELECT id FROM expenses WHERE trip_id = $1 AND status = 'active'
      )
      WHERE u.id IN (
        SELECT DISTINCT user_id FROM trip_collaborators WHERE trip_id = $1
        UNION
        SELECT created_by FROM trips WHERE id = $1
      )
      GROUP BY u.id, u.name
    `;

    const result = await db.query(query, [tripId]);
    
    return result.rows.map(row => ({
      userId: row.userId,
      userName: row.userName,
      totalSpent: parseFloat(row.totalSpent),
      totalOwes: parseFloat(row.totalOwes),
      netBalance: parseFloat(row.totalSpent) - parseFloat(row.totalOwes),
      settlements: [] // TODO: Calculate settlements between users
    }));
  }
}
