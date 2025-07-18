import { Pool } from 'pg';
import { getDatabase } from '../../config/database';
import { AgentSession } from './agent-coordinator';

export interface AgentSessionLogEntry {
  id: string;
  sessionId: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  component?: string;
  step?: string;
  metadata?: Record<string, any>;
  errorDetails?: {
    code?: string;
    stack?: string;
    details?: Record<string, any>;
  };
}

export interface AgentSessionLogFilter {
  level?: 'debug' | 'info' | 'warn' | 'error';
  component?: string;
  limit?: number;
  offset?: number;
}

export interface AgentSessionPersistentData extends Omit<AgentSession, 'id'> {
  id: string;
  workflowType: string;
  inputData: Record<string, any>;
  metadata?: Record<string, any>;
  lastActivity: Date;
}

export class AgentSessionService {
  private pool: Pool;

  constructor() {
    this.pool = getDatabase();
  }

  /**
   * Create a new session in the database
   */
  async createSession(session: AgentSession, workflowType: string, inputData: Record<string, any>): Promise<void> {
    const query = `
      INSERT INTO agent_sessions (
        id, trip_id, user_id, status, current_step, progress, 
        workflow_type, input_data, results, errors, start_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;
    
    const values = [
      session.id,
      session.tripId,
      session.userId,
      session.status,
      session.currentStep,
      session.progress,
      workflowType,
      JSON.stringify(inputData),
      JSON.stringify(session.results),
      session.errors,
      session.startTime
    ];

    await this.pool.query(query, values);
  }

  /**
   * Update an existing session
   */
  async updateSession(session: AgentSession): Promise<void> {
    const query = `
      UPDATE agent_sessions 
      SET status = $2, current_step = $3, progress = $4, results = $5, 
          errors = $6, end_time = $7, last_activity = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    
    const values = [
      session.id,
      session.status,
      session.currentStep,
      session.progress,
      JSON.stringify(session.results),
      session.errors,
      session.endTime
    ];

    await this.pool.query(query, values);
  }

  /**
   * Get session by ID from database
   */
  async getSession(sessionId: string): Promise<AgentSessionPersistentData | null> {
    const query = `
      SELECT * FROM agent_sessions WHERE id = $1
    `;
    
    const result = await this.pool.query(query, [sessionId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      tripId: row.trip_id,
      userId: row.user_id,
      status: row.status,
      startTime: row.start_time,
      endTime: row.end_time,
      currentStep: row.current_step,
      progress: row.progress,
      results: row.results || {},
      errors: row.errors || [],
      workflowType: row.workflow_type,
      inputData: row.input_data || {},
      metadata: row.metadata || {},
      lastActivity: row.last_activity
    };
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<AgentSessionPersistentData[]> {
    const query = `
      SELECT * FROM agent_sessions 
      WHERE user_id = $1 
      ORDER BY start_time DESC
    `;
    
    const result = await this.pool.query(query, [userId]);
    
    return result.rows.map(row => ({
      id: row.id,
      tripId: row.trip_id,
      userId: row.user_id,
      status: row.status,
      startTime: row.start_time,
      endTime: row.end_time,
      currentStep: row.current_step,
      progress: row.progress,
      results: row.results || {},
      errors: row.errors || [],
      workflowType: row.workflow_type,
      inputData: row.input_data || {},
      metadata: row.metadata || {},
      lastActivity: row.last_activity
    }));
  }

  /**
   * Add a log entry for a session
   */
  async addLog(
    sessionId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    component?: string,
    step?: string,
    metadata?: Record<string, any>,
    errorDetails?: AgentSessionLogEntry['errorDetails']
  ): Promise<void> {
    const query = `
      INSERT INTO agent_session_logs (
        session_id, level, message, component, step, metadata, error_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    const values = [
      sessionId,
      level,
      message,
      component,
      step,
      metadata ? JSON.stringify(metadata) : null,
      errorDetails ? JSON.stringify(errorDetails) : null
    ];

    await this.pool.query(query, values);
  }

  /**
   * Get logs for a session with filtering
   */
  async getSessionLogs(sessionId: string, filter: AgentSessionLogFilter = {}): Promise<{
    logs: AgentSessionLogEntry[];
    totalCount: number;
    hasMore: boolean;
  }> {
    let whereConditions = ['session_id = $1'];
    let queryParams: any[] = [sessionId];
    let paramIndex = 2;

    // Add level filter
    if (filter.level) {
      whereConditions.push(`level = $${paramIndex}`);
      queryParams.push(filter.level);
      paramIndex++;
    }

    // Add component filter
    if (filter.component) {
      whereConditions.push(`component = $${paramIndex}`);
      queryParams.push(filter.component);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM agent_session_logs 
      WHERE ${whereClause}
    `;
    const countResult = await this.pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].total);

    // Get logs with pagination
    const limit = filter.limit || 100;
    const offset = filter.offset || 0;

    const logsQuery = `
      SELECT id, session_id, timestamp, level, message, component, step, metadata, error_details
      FROM agent_session_logs 
      WHERE ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(limit, offset);
    const logsResult = await this.pool.query(logsQuery, queryParams);

    const logs: AgentSessionLogEntry[] = logsResult.rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      level: row.level,
      message: row.message,
      component: row.component,
      step: row.step,
      metadata: row.metadata || {},
      errorDetails: row.error_details || undefined
    }));

    const hasMore = (offset + limit) < totalCount;

    return {
      logs,
      totalCount,
      hasMore
    };
  }

  /**
   * Delete old completed sessions and their logs
   */
  async cleanupOldSessions(maxAgeHours: number = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    
    const query = `
      DELETE FROM agent_sessions 
      WHERE start_time < $1 
      AND status IN ('completed', 'failed', 'cancelled')
    `;
    
    const result = await this.pool.query(query, [cutoffTime]);
    return result.rowCount || 0;
  }

  /**
   * Get session statistics
   */
  async getSessionStats(userId?: string): Promise<{
    total: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    let query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
      FROM agent_sessions
    `;
    
    const queryParams: any[] = [];
    
    if (userId) {
      query += ' WHERE user_id = $1';
      queryParams.push(userId);
    }

    const result = await this.pool.query(query, queryParams);
    const row = result.rows[0];

    return {
      total: parseInt(row.total),
      active: parseInt(row.active),
      completed: parseInt(row.completed),
      failed: parseInt(row.failed),
      cancelled: parseInt(row.cancelled)
    };
  }
}

// Export singleton instance
export const agentSessionService = new AgentSessionService();
