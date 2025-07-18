import { getDatabase } from '../config/database';
import { User } from './user';

export interface ChatRoom {
  id: string;
  tripId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Optional relations
  members?: ChatRoomMember[];
  lastMessage?: ChatMessage;
  unreadCount?: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  messageType: 'text' | 'system' | 'ai_suggestion' | 'vote' | 'command_result' | 'expense_notification';
  metadata: Record<string, any>;
  repliedTo?: string;
  editedAt?: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Optional relations
  user?: User;
  repliedMessage?: ChatMessage;
}

export interface ChatRoomMember {
  roomId: string;
  userId: string;
  role: 'admin' | 'member' | 'viewer';
  permissions: string[];
  joinedAt: Date;
  lastReadAt: Date;
  notificationEnabled: boolean;
  
  // Optional relations
  user?: User;
}

export interface CreateChatRoomData {
  tripId: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  createdBy: string;
}

export interface UpdateChatRoomData {
  name?: string;
  description?: string;
}

export interface CreateMessageData {
  roomId: string;
  userId: string;
  content: string;
  messageType?: ChatMessage['messageType'];
  metadata?: Record<string, any>;
  repliedTo?: string;
}

export interface UpdateMessageData {
  content: string;
}

export interface GetMessagesOptions {
  limit?: number;
  before?: string;
  after?: string;
  types?: string[];
}

export class ChatRepository {
  // ============================================================================
  // Chat Room Operations
  // ============================================================================
  
  static async createRoom(data: CreateChatRoomData): Promise<ChatRoom> {
    const db = getDatabase();
    const query = `
      INSERT INTO chat_rooms (trip_id, name, description, is_default, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, trip_id as "tripId", name, description, is_default as "isDefault", 
                created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const result = await db.query(query, [
      data.tripId,
      data.name,
      data.description,
      data.isDefault || false,
      data.createdBy
    ]);
    
    return result.rows[0];
  }
  
  static async findRoomsByTripId(tripId: string): Promise<ChatRoom[]> {
    const db = getDatabase();
    const query = `
      SELECT id, trip_id as "tripId", name, description, is_default as "isDefault", 
             created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
      FROM chat_rooms 
      WHERE trip_id = $1 
      ORDER BY is_default DESC, created_at ASC
    `;
    
    const result = await db.query(query, [tripId]);
    return result.rows;
  }
  
  static async findRoomById(roomId: string): Promise<ChatRoom | null> {
    const db = getDatabase();
    const query = `
      SELECT id, trip_id as "tripId", name, description, is_default as "isDefault", 
             created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
      FROM chat_rooms 
      WHERE id = $1
    `;
    
    const result = await db.query(query, [roomId]);
    return result.rows[0] || null;
  }
  
  static async updateRoom(roomId: string, updates: UpdateChatRoomData): Promise<ChatRoom> {
    const db = getDatabase();
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    
    fields.push(`updated_at = NOW()`);
    values.push(roomId);
    
    const query = `
      UPDATE chat_rooms SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, trip_id as "tripId", name, description, is_default as "isDefault", 
                created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  static async deleteRoom(roomId: string): Promise<void> {
    const db = getDatabase();
    const query = 'DELETE FROM chat_rooms WHERE id = $1';
    await db.query(query, [roomId]);
  }
  
  // ============================================================================
  // Member Operations
  // ============================================================================
  
  static async addMember(roomId: string, userId: string, role: string = 'member'): Promise<void> {
    const db = getDatabase();
    const query = `
      INSERT INTO chat_room_members (room_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (room_id, user_id) DO UPDATE SET role = $3
    `;
    
    await db.query(query, [roomId, userId, role]);
  }
  
  static async removeMember(roomId: string, userId: string): Promise<void> {
    const db = getDatabase();
    const query = 'DELETE FROM chat_room_members WHERE room_id = $1 AND user_id = $2';
    await db.query(query, [roomId, userId]);
  }
  
  static async getRoomMembers(roomId: string): Promise<ChatRoomMember[]> {
    const db = getDatabase();
    const query = `
      SELECT crm.room_id as "roomId", crm.user_id as "userId", crm.role, crm.permissions,
             crm.joined_at as "joinedAt", crm.last_read_at as "lastReadAt", 
             crm.notification_enabled as "notificationEnabled",
             u.id, u.name, u.email
      FROM chat_room_members crm
      JOIN users u ON crm.user_id = u.id
      WHERE crm.room_id = $1
      ORDER BY crm.joined_at ASC
    `;
    
    const result = await db.query(query, [roomId]);
    return result.rows.map(row => ({
      roomId: row.roomId,
      userId: row.userId,
      role: row.role,
      permissions: row.permissions,
      joinedAt: row.joinedAt,
      lastReadAt: row.lastReadAt,
      notificationEnabled: row.notificationEnabled,
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }));
  }
  
  static async updateMemberRole(roomId: string, userId: string, role: string): Promise<void> {
    const db = getDatabase();
    const query = `
      UPDATE chat_room_members 
      SET role = $3, updated_at = NOW()
      WHERE room_id = $1 AND user_id = $2
    `;
    
    await db.query(query, [roomId, userId, role]);
  }
  
  static async markAsRead(roomId: string, userId: string, messageId: string): Promise<void> {
    const db = getDatabase();
    const query = `
      UPDATE chat_room_members 
      SET last_read_at = (
        SELECT created_at FROM chat_messages WHERE id = $3
      )
      WHERE room_id = $1 AND user_id = $2
    `;
    
    await db.query(query, [roomId, userId, messageId]);
  }
  
  // ============================================================================
  // Message Operations
  // ============================================================================
  
  static async createMessage(data: CreateMessageData): Promise<ChatMessage> {
    const db = getDatabase();
    const query = `
      INSERT INTO chat_messages (room_id, user_id, content, message_type, metadata, replied_to)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, room_id as "roomId", user_id as "userId", content, message_type as "messageType",
                metadata, replied_to as "repliedTo", edited_at as "editedAt", is_deleted as "isDeleted",
                created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const result = await db.query(query, [
      data.roomId,
      data.userId,
      data.content,
      data.messageType || 'text',
      JSON.stringify(data.metadata || {}),
      data.repliedTo
    ]);
    
    return result.rows[0];
  }
  
  static async getMessages(roomId: string, options: GetMessagesOptions = {}): Promise<ChatMessage[]> {
    const db = getDatabase();
    const { limit = 50, before, after, types } = options;
    
    let query = `
      SELECT cm.id, cm.room_id as "roomId", cm.user_id as "userId", cm.content, 
             cm.message_type as "messageType", cm.metadata, cm.replied_to as "repliedTo",
             cm.edited_at as "editedAt", cm.is_deleted as "isDeleted",
             cm.created_at as "createdAt", cm.updated_at as "updatedAt",
             u.name, u.email
      FROM chat_messages cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.room_id = $1 AND cm.is_deleted = FALSE
    `;
    
    const params: any[] = [roomId];
    let paramIndex = 2;
    
    if (before) {
      query += ` AND cm.created_at < (SELECT created_at FROM chat_messages WHERE id = $${paramIndex})`;
      params.push(before);
      paramIndex++;
    }
    
    if (after) {
      query += ` AND cm.created_at > (SELECT created_at FROM chat_messages WHERE id = $${paramIndex})`;
      params.push(after);
      paramIndex++;
    }
    
    if (types && types.length > 0) {
      query += ` AND cm.message_type = ANY($${paramIndex})`;
      params.push(types);
      paramIndex++;
    }
    
    query += ` ORDER BY cm.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const result = await db.query(query, params);
    return result.rows.map(row => ({
      id: row.id,
      roomId: row.roomId,
      userId: row.userId,
      content: row.content,
      messageType: row.messageType,
      metadata: row.metadata,
      repliedTo: row.repliedTo,
      editedAt: row.editedAt,
      isDeleted: row.isDeleted,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      user: {
        id: row.userId,
        name: row.name,
        email: row.email,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }));
  }
  
  static async updateMessage(messageId: string, updates: UpdateMessageData): Promise<ChatMessage> {
    const db = getDatabase();
    const query = `
      UPDATE chat_messages 
      SET content = $2, edited_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING id, room_id as "roomId", user_id as "userId", content, message_type as "messageType",
                metadata, replied_to as "repliedTo", edited_at as "editedAt", is_deleted as "isDeleted",
                created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const result = await db.query(query, [messageId, updates.content]);
    return result.rows[0];
  }
  
  static async deleteMessage(messageId: string): Promise<void> {
    const db = getDatabase();
    const query = `
      UPDATE chat_messages 
      SET is_deleted = TRUE, updated_at = NOW()
      WHERE id = $1
    `;
    
    await db.query(query, [messageId]);
  }
  
  static async searchMessages(roomId: string, searchQuery: string): Promise<ChatMessage[]> {
    const db = getDatabase();
    const query = `
      SELECT cm.id, cm.room_id as "roomId", cm.user_id as "userId", cm.content, 
             cm.message_type as "messageType", cm.metadata, cm.replied_to as "repliedTo",
             cm.edited_at as "editedAt", cm.is_deleted as "isDeleted",
             cm.created_at as "createdAt", cm.updated_at as "updatedAt",
             u.name, u.email
      FROM chat_messages cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.room_id = $1 AND cm.is_deleted = FALSE
        AND cm.content ILIKE $2
      ORDER BY cm.created_at DESC
      LIMIT 20
    `;
    
    const result = await db.query(query, [roomId, `%${searchQuery}%`]);
    return result.rows.map(row => ({
      id: row.id,
      roomId: row.roomId,
      userId: row.userId,
      content: row.content,
      messageType: row.messageType,
      metadata: row.metadata,
      repliedTo: row.repliedTo,
      editedAt: row.editedAt,
      isDeleted: row.isDeleted,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      user: {
        id: row.userId,
        name: row.name,
        email: row.email,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }));
  }
  
  // ============================================================================
  // Helper Methods
  // ============================================================================
  
  static async userHasAccess(roomId: string, userId: string): Promise<boolean> {
    const db = getDatabase();
    const query = `
      SELECT 1 FROM chat_room_members 
      WHERE room_id = $1 AND user_id = $2
    `;
    
    const result = await db.query(query, [roomId, userId]);
    return result.rows.length > 0;
  }
  
  static async getUserPermissions(roomId: string, userId: string): Promise<string[]> {
    const db = getDatabase();
    const query = `
      SELECT permissions FROM chat_room_members 
      WHERE room_id = $1 AND user_id = $2
    `;
    
    const result = await db.query(query, [roomId, userId]);
    return result.rows[0]?.permissions || [];
  }
}