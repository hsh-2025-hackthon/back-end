import { getDatabase } from '../config/database';
import { User } from './user';

export interface Vote {
  id: string;
  tripId: string;
  chatMessageId?: string;
  title: string;
  description?: string;
  voteType: 'destination' | 'restaurant' | 'activity' | 'budget' | 'accommodation' | 'transportation';
  options: VoteOption[];
  settings: VoteSettings;
  creatorId: string;
  deadline?: Date;
  status: 'active' | 'closed' | 'cancelled';
  resultSummary?: VoteResultSummary;
  createdAt: Date;
  updatedAt: Date;
  
  // Optional relations
  creator?: User;
  responses?: VoteResponse[];
}

export interface VoteOption {
  id: string;
  name: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface VoteSettings {
  multipleChoice: boolean;
  anonymous: boolean;
  changeVote: boolean;
  requireComment: boolean;
  showResults: 'never' | 'after_vote' | 'always';
}

export interface VoteResponse {
  id: string;
  voteId: string;
  userId: string;
  selectedOptions: string[];
  ranking?: Record<string, number>;
  comment?: string;
  isAnonymous: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Optional relations
  user?: User;
}

export interface VoteResultSummary {
  totalResponses: number;
  optionResults: Array<{
    optionId: string;
    votes: number;
    percentage: number;
  }>;
  topChoice?: string;
  participationRate: number;
}

export interface CreateVoteData {
  tripId: string;
  title: string;
  description?: string;
  voteType: Vote['voteType'];
  options: Omit<VoteOption, 'id'>[];
  settings?: Partial<VoteSettings>;
  deadline?: Date;
  chatMessageId?: string;
  creatorId: string;
}

export interface UpdateVoteData {
  title?: string;
  description?: string;
  deadline?: Date;
  status?: Vote['status'];
}

export interface CreateVoteResponseData {
  voteId: string;
  userId: string;
  selectedOptions: string[];
  ranking?: Record<string, number>;
  comment?: string;
  isAnonymous?: boolean;
}

export interface VoteFilters {
  status?: Vote['status'];
  voteType?: Vote['voteType'];
  includeResults?: boolean;
}

export class VoteRepository {
  // ============================================================================
  // Vote Operations
  // ============================================================================
  
  static async createVote(data: CreateVoteData): Promise<Vote> {
    const db = getDatabase();
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');
      
      // Generate option IDs and prepare options
      const optionsWithIds: VoteOption[] = data.options.map(option => ({
        ...option,
        id: `opt_${Math.random().toString(36).substr(2, 9)}`
      }));
      
      // Default settings
      const settings: VoteSettings = {
        multipleChoice: false,
        anonymous: false,
        changeVote: true,
        requireComment: false,
        showResults: 'after_vote',
        ...data.settings
      };
      
      const query = `
        INSERT INTO votes (trip_id, chat_message_id, title, description, vote_type, options, settings, creator_id, deadline)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, trip_id as "tripId", chat_message_id as "chatMessageId", title, description, 
                  vote_type as "voteType", options, settings, creator_id as "creatorId", deadline, 
                  status, result_summary as "resultSummary", created_at as "createdAt", updated_at as "updatedAt"
      `;
      
      const result = await client.query(query, [
        data.tripId,
        data.chatMessageId,
        data.title,
        data.description,
        data.voteType,
        JSON.stringify(optionsWithIds),
        JSON.stringify(settings),
        data.creatorId,
        data.deadline
      ]);
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async findVotesByTripId(tripId: string, filters: VoteFilters = {}): Promise<Vote[]> {
    const db = getDatabase();
    
    let query = `
      SELECT v.id, v.trip_id as "tripId", v.chat_message_id as "chatMessageId", v.title, v.description, 
             v.vote_type as "voteType", v.options, v.settings, v.creator_id as "creatorId", v.deadline, 
             v.status, v.result_summary as "resultSummary", v.created_at as "createdAt", v.updated_at as "updatedAt",
             u.name, u.email
      FROM votes v
      JOIN users u ON v.creator_id = u.id
      WHERE v.trip_id = $1
    `;
    
    const params = [tripId];
    let paramIndex = 2;
    
    if (filters.status) {
      query += ` AND v.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }
    
    if (filters.voteType) {
      query += ` AND v.vote_type = $${paramIndex}`;
      params.push(filters.voteType);
      paramIndex++;
    }
    
    query += ` ORDER BY v.created_at DESC`;
    
    const result = await db.query(query, params);
    const votes = result.rows.map(row => ({
      id: row.id,
      tripId: row.tripId,
      chatMessageId: row.chatMessageId,
      title: row.title,
      description: row.description,
      voteType: row.voteType,
      options: row.options,
      settings: row.settings,
      creatorId: row.creatorId,
      deadline: row.deadline,
      status: row.status,
      resultSummary: row.resultSummary,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      creator: {
        id: row.creatorId,
        name: row.name,
        email: row.email,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      responses: undefined as VoteResponse[] | undefined
    }));
    
    // Include responses if requested
    if (filters.includeResults) {
      for (const vote of votes) {
        vote.responses = await this.getVoteResponses(vote.id);
      }
    }
    
    return votes as Vote[];
  }
  
  static async findVoteById(voteId: string, includeResponses: boolean = false): Promise<Vote | null> {
    const db = getDatabase();
    const query = `
      SELECT v.id, v.trip_id as "tripId", v.chat_message_id as "chatMessageId", v.title, v.description, 
             v.vote_type as "voteType", v.options, v.settings, v.creator_id as "creatorId", v.deadline, 
             v.status, v.result_summary as "resultSummary", v.created_at as "createdAt", v.updated_at as "updatedAt",
             u.name, u.email
      FROM votes v
      JOIN users u ON v.creator_id = u.id
      WHERE v.id = $1
    `;
    
    const result = await db.query(query, [voteId]);
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    const vote: Vote = {
      id: row.id,
      tripId: row.tripId,
      chatMessageId: row.chatMessageId,
      title: row.title,
      description: row.description,
      voteType: row.voteType,
      options: row.options,
      settings: row.settings,
      creatorId: row.creatorId,
      deadline: row.deadline,
      status: row.status,
      resultSummary: row.resultSummary,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      creator: {
        id: row.creatorId,
        name: row.name,
        email: row.email,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };
    
    if (includeResponses) {
      vote.responses = await this.getVoteResponses(voteId);
    }
    
    return vote;
  }
  
  static async updateVote(voteId: string, updates: UpdateVoteData): Promise<Vote> {
    const db = getDatabase();
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.deadline !== undefined) {
      fields.push(`deadline = $${paramIndex++}`);
      values.push(updates.deadline);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    
    fields.push(`updated_at = NOW()`);
    values.push(voteId);
    
    const query = `
      UPDATE votes SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, trip_id as "tripId", chat_message_id as "chatMessageId", title, description, 
                vote_type as "voteType", options, settings, creator_id as "creatorId", deadline, 
                status, result_summary as "resultSummary", created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  static async deleteVote(voteId: string): Promise<void> {
    const db = getDatabase();
    const query = 'DELETE FROM votes WHERE id = $1';
    await db.query(query, [voteId]);
  }
  
  static async closeVote(voteId: string): Promise<Vote> {
    return this.updateVote(voteId, { status: 'closed' });
  }
  
  // ============================================================================
  // Vote Response Operations
  // ============================================================================
  
  static async submitResponse(data: CreateVoteResponseData): Promise<VoteResponse> {
    const db = getDatabase();
    const query = `
      INSERT INTO vote_responses (vote_id, user_id, selected_options, ranking, comment, is_anonymous)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (vote_id, user_id) DO UPDATE SET
        selected_options = $3,
        ranking = $4,
        comment = $5,
        is_anonymous = $6,
        updated_at = NOW()
      RETURNING id, vote_id as "voteId", user_id as "userId", selected_options as "selectedOptions",
                ranking, comment, is_anonymous as "isAnonymous", created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const result = await db.query(query, [
      data.voteId,
      data.userId,
      JSON.stringify(data.selectedOptions),
      data.ranking ? JSON.stringify(data.ranking) : null,
      data.comment,
      data.isAnonymous || false
    ]);
    
    return result.rows[0];
  }
  
  static async updateResponse(voteId: string, userId: string, data: Partial<CreateVoteResponseData>): Promise<VoteResponse> {
    const db = getDatabase();
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    if (data.selectedOptions !== undefined) {
      fields.push(`selected_options = $${paramIndex++}`);
      values.push(JSON.stringify(data.selectedOptions));
    }
    if (data.ranking !== undefined) {
      fields.push(`ranking = $${paramIndex++}`);
      values.push(data.ranking ? JSON.stringify(data.ranking) : null);
    }
    if (data.comment !== undefined) {
      fields.push(`comment = $${paramIndex++}`);
      values.push(data.comment);
    }
    
    fields.push(`updated_at = NOW()`);
    values.push(voteId, userId);
    
    const query = `
      UPDATE vote_responses SET ${fields.join(', ')}
      WHERE vote_id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING id, vote_id as "voteId", user_id as "userId", selected_options as "selectedOptions",
                ranking, comment, is_anonymous as "isAnonymous", created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  static async deleteResponse(voteId: string, userId: string): Promise<void> {
    const db = getDatabase();
    const query = 'DELETE FROM vote_responses WHERE vote_id = $1 AND user_id = $2';
    await db.query(query, [voteId, userId]);
  }
  
  static async getVoteResponses(voteId: string): Promise<VoteResponse[]> {
    const db = getDatabase();
    const query = `
      SELECT vr.id, vr.vote_id as "voteId", vr.user_id as "userId", vr.selected_options as "selectedOptions",
             vr.ranking, vr.comment, vr.is_anonymous as "isAnonymous", vr.created_at as "createdAt", vr.updated_at as "updatedAt",
             u.name, u.email
      FROM vote_responses vr
      JOIN users u ON vr.user_id = u.id
      WHERE vr.vote_id = $1
      ORDER BY vr.created_at ASC
    `;
    
    const result = await db.query(query, [voteId]);
    return result.rows.map(row => ({
      id: row.id,
      voteId: row.voteId,
      userId: row.userId,
      selectedOptions: row.selectedOptions,
      ranking: row.ranking,
      comment: row.comment,
      isAnonymous: row.isAnonymous,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      user: row.isAnonymous ? undefined : {
        id: row.userId,
        name: row.name,
        email: row.email,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }));
  }
  
  // ============================================================================
  // Result Calculation
  // ============================================================================
  
  static async calculateResults(voteId: string): Promise<VoteResultSummary> {
    const db = getDatabase();
    
    // Get vote details
    const vote = await this.findVoteById(voteId);
    if (!vote) {
      throw new Error('Vote not found');
    }
    
    // Get all responses
    const responses = await this.getVoteResponses(voteId);
    
    // Calculate results
    const optionCounts: Record<string, number> = {};
    vote.options.forEach(option => {
      optionCounts[option.id] = 0;
    });
    
    responses.forEach(response => {
      response.selectedOptions.forEach(optionId => {
        if (optionCounts[optionId] !== undefined) {
          optionCounts[optionId]++;
        }
      });
    });
    
    const totalResponses = responses.length;
    const optionResults = Object.entries(optionCounts).map(([optionId, votes]) => ({
      optionId,
      votes,
      percentage: totalResponses > 0 ? parseFloat(((votes / totalResponses) * 100).toFixed(2)) : 0
    }));
    
    // Find top choice
    const topChoice = optionResults.reduce((max, current) => 
      current.votes > max.votes ? current : max
    );
    
    // Calculate participation rate (assume all trip members are eligible)
    const tripMembersQuery = `
      SELECT COUNT(DISTINCT user_id) as count
      FROM trip_collaborators tc
      WHERE tc.trip_id = $1
      UNION ALL
      SELECT COUNT(*) as count
      FROM trips t
      WHERE t.id = $1 AND t.created_by IS NOT NULL
    `;
    
    const tripMembersResult = await db.query(tripMembersQuery, [vote.tripId]);
    const totalEligible = tripMembersResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    
    const participationRate = totalEligible > 0 ? (totalResponses / totalEligible) * 100 : 0;
    
    return {
      totalResponses,
      optionResults,
      topChoice: topChoice.votes > 0 ? topChoice.optionId : undefined,
      participationRate
    };
  }
  
  static async updateResultSummary(voteId: string): Promise<void> {
    const db = getDatabase();
    const results = await this.calculateResults(voteId);
    
    const query = `
      UPDATE votes 
      SET result_summary = $2, updated_at = NOW()
      WHERE id = $1
    `;
    
    await db.query(query, [voteId, JSON.stringify(results)]);
  }
  
  // ============================================================================
  // Helper Methods
  // ============================================================================
  
  static async getUserResponse(voteId: string, userId: string): Promise<VoteResponse | null> {
    const db = getDatabase();
    const query = `
      SELECT id, vote_id as "voteId", user_id as "userId", selected_options as "selectedOptions",
             ranking, comment, is_anonymous as "isAnonymous", created_at as "createdAt", updated_at as "updatedAt"
      FROM vote_responses
      WHERE vote_id = $1 AND user_id = $2
    `;
    
    const result = await db.query(query, [voteId, userId]);
    return result.rows[0] || null;
  }
  
  static async canUserVote(voteId: string, userId: string): Promise<boolean> {
    const vote = await this.findVoteById(voteId);
    if (!vote) return false;
    
    // Check if vote is active
    if (vote.status !== 'active') return false;
    
    // Check if deadline has passed
    if (vote.deadline && new Date() > vote.deadline) return false;
    
    // Check if user has access to the trip
    const db = getDatabase();
    const query = `
      SELECT 1 FROM trip_collaborators tc
      WHERE tc.trip_id = $1 AND tc.user_id = $2
      UNION
      SELECT 1 FROM trips t
      WHERE t.id = $1 AND t.created_by = $2
    `;
    
    const result = await db.query(query, [vote.tripId, userId]);
    return result.rows.length > 0;
  }
}