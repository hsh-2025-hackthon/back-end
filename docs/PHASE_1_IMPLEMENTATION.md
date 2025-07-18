# 第一階段實施指南 - 聊天室與協作增強

## 🎯 第一階段目標 (Week 1, Day 1-3)

本階段將實現多用戶聊天室系統、NLP 解析與投票機制，為協同旅行規劃提供基礎的溝通協作平台。

## 📋 實施檢查清單

### Day 1: 資料庫架構與基礎設定
- [ ] 建立聊天室相關資料表
- [ ] 建立投票系統資料表  
- [ ] 更新資料庫遷移腳本
- [ ] 設定 WebSocket 連線配置

### Day 2: 聊天室核心功能
- [ ] 實現聊天室 CRUD API
- [ ] 實現即時訊息傳送
- [ ] 整合 WebPubSub 即時通訊
- [ ] 實現成員管理功能

### Day 3: NLP 解析與投票系統
- [ ] 實現基礎 NLP 解析服務
- [ ] 實現投票系統 API
- [ ] 整合快速指令處理
- [ ] 編寫單元測試

---

## 🗄️ 資料庫遷移腳本

### 步驟 1: 創建新的遷移檔案

```typescript
// scripts/migrations/001_add_chat_system.ts

export const migration_001_add_chat_system = {
  id: '001_add_chat_system',
  description: 'Add chat rooms, messages, and voting system tables',
  
  async up(): Promise<void> {
    const queries = [
      // 聊天室表
      `
      CREATE TABLE chat_rooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_default BOOLEAN DEFAULT FALSE,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX idx_chat_rooms_trip_id ON chat_rooms(trip_id);
      CREATE INDEX idx_chat_rooms_created_by ON chat_rooms(created_by);
      `,
      
      // 聊天訊息表
      `
      CREATE TABLE chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        message_type VARCHAR(50) DEFAULT 'text',
        metadata JSONB DEFAULT '{}',
        replied_to UUID REFERENCES chat_messages(id),
        edited_at TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX idx_chat_messages_room_id_created_at ON chat_messages(room_id, created_at DESC);
      CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
      CREATE INDEX idx_chat_messages_type ON chat_messages(message_type);
      `,
      
      // 聊天室成員表
      `
      CREATE TABLE chat_room_members (
        room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        role VARCHAR(50) DEFAULT 'member',
        permissions JSONB DEFAULT '["read", "write"]',
        joined_at TIMESTAMP DEFAULT NOW(),
        last_read_at TIMESTAMP DEFAULT NOW(),
        notification_enabled BOOLEAN DEFAULT TRUE,
        PRIMARY KEY (room_id, user_id)
      );
      
      CREATE INDEX idx_room_members_user_id ON chat_room_members(user_id);
      `,
      
      // 投票表
      `
      CREATE TABLE votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        chat_message_id UUID REFERENCES chat_messages(id),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        vote_type VARCHAR(50) NOT NULL,
        options JSONB NOT NULL,
        settings JSONB DEFAULT '{}',
        creator_id UUID NOT NULL REFERENCES users(id),
        deadline TIMESTAMP,
        status VARCHAR(50) DEFAULT 'active',
        result_summary JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX idx_votes_trip_id ON votes(trip_id);
      CREATE INDEX idx_votes_status_deadline ON votes(status, deadline);
      CREATE INDEX idx_votes_creator_id ON votes(creator_id);
      `,
      
      // 投票回應表
      `
      CREATE TABLE vote_responses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vote_id UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        selected_options JSONB NOT NULL,
        ranking JSONB,
        comment TEXT,
        is_anonymous BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(vote_id, user_id)
      );
      
      CREATE INDEX idx_vote_responses_vote_id ON vote_responses(vote_id);
      CREATE INDEX idx_vote_responses_user_id ON vote_responses(user_id);
      `
    ];
    
    for (const query of queries) {
      await db.query(query);
    }
  },
  
  async down(): Promise<void> {
    const queries = [
      'DROP TABLE IF EXISTS vote_responses;',
      'DROP TABLE IF EXISTS votes;',
      'DROP TABLE IF EXISTS chat_room_members;',
      'DROP TABLE IF EXISTS chat_messages;',
      'DROP TABLE IF EXISTS chat_rooms;'
    ];
    
    for (const query of queries) {
      await db.query(query);
    }
  }
};
```

---

## 📝 模型定義

### 步驟 2: 創建聊天系統模型

```typescript
// src/models/chat.ts

export interface ChatRoom {
  id: string;
  tripId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  
  // 關聯資料 (可選)
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
  
  // 關聯資料
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
  
  // 關聯資料
  user?: User;
}

export interface CreateChatRoomData {
  tripId: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  createdBy: string;
}

export interface CreateMessageData {
  roomId: string;
  userId: string;
  content: string;
  messageType?: ChatMessage['messageType'];
  metadata?: Record<string, any>;
  repliedTo?: string;
}

// Repository 類別
export class ChatRepository {
  // 聊天室操作
  static async createRoom(data: CreateChatRoomData): Promise<ChatRoom>;
  static async findRoomsByTripId(tripId: string): Promise<ChatRoom[]>;
  static async findRoomById(roomId: string): Promise<ChatRoom | null>;
  static async updateRoom(roomId: string, updates: Partial<ChatRoom>): Promise<ChatRoom>;
  static async deleteRoom(roomId: string): Promise<void>;
  
  // 成員操作
  static async addMember(roomId: string, userId: string, role?: string): Promise<void>;
  static async removeMember(roomId: string, userId: string): Promise<void>;
  static async getRoomMembers(roomId: string): Promise<ChatRoomMember[]>;
  static async updateMemberRole(roomId: string, userId: string, role: string): Promise<void>;
  static async markAsRead(roomId: string, userId: string, messageId: string): Promise<void>;
  
  // 訊息操作
  static async createMessage(data: CreateMessageData): Promise<ChatMessage>;
  static async getMessages(roomId: string, options?: GetMessagesOptions): Promise<ChatMessage[]>;
  static async updateMessage(messageId: string, content: string): Promise<ChatMessage>;
  static async deleteMessage(messageId: string): Promise<void>;
  static async searchMessages(roomId: string, query: string): Promise<ChatMessage[]>;
}

interface GetMessagesOptions {
  limit?: number;
  before?: string;
  after?: string;
  types?: string[];
}
```

### 步驟 3: 創建投票系統模型

```typescript
// src/models/vote.ts

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
  
  // 關聯資料
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
  
  // 關聯資料
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

export interface CreateVoteResponseData {
  voteId: string;
  userId: string;
  selectedOptions: string[];
  ranking?: Record<string, number>;
  comment?: string;
  isAnonymous?: boolean;
}

// Repository 類別
export class VoteRepository {
  // 投票操作
  static async createVote(data: CreateVoteData): Promise<Vote>;
  static async findVotesByTripId(tripId: string, filters?: VoteFilters): Promise<Vote[]>;
  static async findVoteById(voteId: string, includeResponses?: boolean): Promise<Vote | null>;
  static async updateVote(voteId: string, updates: Partial<Vote>): Promise<Vote>;
  static async deleteVote(voteId: string): Promise<void>;
  static async closeVote(voteId: string): Promise<Vote>;
  
  // 投票回應操作
  static async submitResponse(data: CreateVoteResponseData): Promise<VoteResponse>;
  static async updateResponse(voteId: string, userId: string, data: Partial<CreateVoteResponseData>): Promise<VoteResponse>;
  static async deleteResponse(voteId: string, userId: string): Promise<void>;
  static async getVoteResponses(voteId: string): Promise<VoteResponse[]>;
  
  // 結果計算
  static async calculateResults(voteId: string): Promise<VoteResultSummary>;
  static async updateResultSummary(voteId: string): Promise<void>;
}

interface VoteFilters {
  status?: Vote['status'];
  voteType?: Vote['voteType'];
  includeResults?: boolean;
}
```

---

## 🔌 API 路由實現

### 步驟 4: 實現聊天室 API

```typescript
// src/api/routes/chat.ts

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { ChatRepository } from '../../models/chat';
import { TripRepository } from '../../models/trip';
import { z } from 'zod';

const router = Router();

// 驗證 Schema
const CreateRoomSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isDefault: z.boolean().optional()
});

const SendMessageSchema = z.object({
  content: z.string().min(1),
  messageType: z.enum(['text', 'system', 'command']).optional(),
  metadata: z.record(z.any()).optional(),
  repliedTo: z.string().uuid().optional()
});

// ============================================================================
// 聊天室管理
// ============================================================================

/**
 * GET /api/trips/:tripId/chat/rooms
 * 獲取旅程的所有聊天室
 */
router.get('/trips/:tripId/chat/rooms', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const { include_members, include_last_message } = req.query;
    
    // 檢查用戶是否有權限存取此旅程
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    const hasAccess = await TripRepository.userHasAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const rooms = await ChatRepository.findRoomsByTripId(tripId);
    
    // 如果需要包含成員資訊
    if (include_members === 'true') {
      for (const room of rooms) {
        room.members = await ChatRepository.getRoomMembers(room.id);
      }
    }
    
    // 如果需要包含最後一則訊息
    if (include_last_message === 'true') {
      for (const room of rooms) {
        const messages = await ChatRepository.getMessages(room.id, { limit: 1 });
        room.lastMessage = messages[0] || null;
      }
    }
    
    res.json(rooms);
  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    res.status(500).json({ message: 'Failed to fetch chat rooms' });
  }
});

/**
 * POST /api/trips/:tripId/chat/rooms
 * 創建新聊天室
 */
router.post('/trips/:tripId/chat/rooms', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const roomData = CreateRoomSchema.parse(req.body);
    
    // 檢查權限
    const hasAccess = await TripRepository.userHasAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const newRoom = await ChatRepository.createRoom({
      ...roomData,
      tripId,
      createdBy: req.user!.id
    });
    
    // 自動將創建者加入聊天室
    await ChatRepository.addMember(newRoom.id, req.user!.id, 'admin');
    
    res.status(201).json(newRoom);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid room data', errors: error.issues });
    }
    console.error('Error creating chat room:', error);
    res.status(500).json({ message: 'Failed to create chat room' });
  }
});

/**
 * PUT /api/chat/rooms/:roomId
 * 更新聊天室資訊
 */
router.put('/chat/rooms/:roomId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const updates = CreateRoomSchema.partial().parse(req.body);
    
    // 檢查權限 (只有管理員可以更新)
    const members = await ChatRepository.getRoomMembers(roomId);
    const userMembership = members.find(m => m.userId === req.user!.id);
    
    if (!userMembership || userMembership.role !== 'admin') {
      return res.status(403).json({ message: 'Only room admins can update room settings' });
    }
    
    const updatedRoom = await ChatRepository.updateRoom(roomId, updates);
    res.json(updatedRoom);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid update data', errors: error.issues });
    }
    console.error('Error updating chat room:', error);
    res.status(500).json({ message: 'Failed to update chat room' });
  }
});

/**
 * DELETE /api/chat/rooms/:roomId
 * 刪除聊天室
 */
router.delete('/chat/rooms/:roomId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    
    const room = await ChatRepository.findRoomById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Chat room not found' });
    }
    
    // 檢查是否為創建者或旅程擁有者
    const trip = await TripRepository.findById(room.tripId);
    const isCreator = room.createdBy === req.user!.id;
    const isTripOwner = trip?.createdBy === req.user!.id;
    
    if (!isCreator && !isTripOwner) {
      return res.status(403).json({ message: 'Only room creator or trip owner can delete room' });
    }
    
    await ChatRepository.deleteRoom(roomId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting chat room:', error);
    res.status(500).json({ message: 'Failed to delete chat room' });
  }
});

// ============================================================================
// 消息管理
// ============================================================================

/**
 * GET /api/chat/rooms/:roomId/messages
 * 獲取聊天室消息
 */
router.get('/chat/rooms/:roomId/messages', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { limit = '50', before, after, types, search } = req.query;
    
    // 檢查用戶是否為聊天室成員
    const members = await ChatRepository.getRoomMembers(roomId);
    const isMember = members.some(m => m.userId === req.user!.id);
    
    if (!isMember) {
      return res.status(403).json({ message: 'Access denied to this chat room' });
    }
    
    const options = {
      limit: Math.min(parseInt(limit as string), 100),
      before: before as string,
      after: after as string,
      types: types ? (types as string).split(',') : undefined
    };
    
    let messages;
    if (search) {
      messages = await ChatRepository.searchMessages(roomId, search as string);
    } else {
      messages = await ChatRepository.getMessages(roomId, options);
    }
    
    const hasMore = messages.length === options.limit;
    const nextCursor = hasMore ? messages[messages.length - 1].id : undefined;
    
    res.json({
      messages,
      has_more: hasMore,
      next_cursor: nextCursor
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

/**
 * POST /api/chat/rooms/:roomId/messages
 * 發送消息
 */
router.post('/chat/rooms/:roomId/messages', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const messageData = SendMessageSchema.parse(req.body);
    
    // 檢查用戶權限
    const members = await ChatRepository.getRoomMembers(roomId);
    const userMembership = members.find(m => m.userId === req.user!.id);
    
    if (!userMembership) {
      return res.status(403).json({ message: 'Access denied to this chat room' });
    }
    
    if (!userMembership.permissions.includes('write')) {
      return res.status(403).json({ message: 'You do not have permission to send messages' });
    }
    
    const message = await ChatRepository.createMessage({
      ...messageData,
      roomId,
      userId: req.user!.id
    });
    
    // 透過 WebSocket 廣播新訊息
    await broadcastMessage(roomId, message);
    
    res.status(201).json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid message data', errors: error.issues });
    }
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

// 其他 API 端點實現...

export default router;

// ============================================================================
// WebSocket 廣播函數
// ============================================================================

async function broadcastMessage(roomId: string, message: ChatMessage): Promise<void> {
  try {
    const { getWebPubSubClient } = await import('../../lib/webpubsub');
    const client = getWebPubSubClient();
    
    await client.sendToGroup(roomId, {
      type: 'new_message',
      data: message
    });
  } catch (error) {
    console.error('Error broadcasting message:', error);
  }
}
```

### 步驟 5: 實現投票系統 API

```typescript
// src/api/routes/votes.ts

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { VoteRepository } from '../../models/vote';
import { TripRepository } from '../../models/trip';
import { z } from 'zod';

const router = Router();

// 驗證 Schema
const CreateVoteSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  voteType: z.enum(['destination', 'restaurant', 'activity', 'budget', 'accommodation', 'transportation']),
  options: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    metadata: z.record(z.any()).optional()
  })).min(2),
  settings: z.object({
    multipleChoice: z.boolean().optional(),
    anonymous: z.boolean().optional(),
    changeVote: z.boolean().optional(),
    requireComment: z.boolean().optional(),
    showResults: z.enum(['never', 'after_vote', 'always']).optional()
  }).optional(),
  deadline: z.string().datetime().optional(),
  chatMessageId: z.string().uuid().optional()
});

const SubmitVoteSchema = z.object({
  selectedOptions: z.array(z.string()).min(1),
  ranking: z.record(z.number()).optional(),
  comment: z.string().optional(),
  isAnonymous: z.boolean().optional()
});

/**
 * GET /api/trips/:tripId/votes
 * 獲取旅程的投票列表
 */
router.get('/trips/:tripId/votes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const { status, type, include_results } = req.query;
    
    // 檢查權限
    const hasAccess = await TripRepository.userHasAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const filters = {
      status: status as any,
      voteType: type as any,
      includeResults: include_results === 'true'
    };
    
    const votes = await VoteRepository.findVotesByTripId(tripId, filters);
    res.json(votes);
  } catch (error) {
    console.error('Error fetching votes:', error);
    res.status(500).json({ message: 'Failed to fetch votes' });
  }
});

/**
 * POST /api/trips/:tripId/votes
 * 創建新投票
 */
router.post('/trips/:tripId/votes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const voteData = CreateVoteSchema.parse(req.body);
    
    // 檢查權限
    const hasAccess = await TripRepository.userHasAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const vote = await VoteRepository.createVote({
      ...voteData,
      tripId,
      creatorId: req.user!.id,
      deadline: voteData.deadline ? new Date(voteData.deadline) : undefined
    });
    
    res.status(201).json(vote);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid vote data', errors: error.issues });
    }
    console.error('Error creating vote:', error);
    res.status(500).json({ message: 'Failed to create vote' });
  }
});

/**
 * POST /api/votes/:voteId/responses
 * 提交投票
 */
router.post('/votes/:voteId/responses', requireAuth, async (req: Request, res: Response) => {
  try {
    const { voteId } = req.params;
    const responseData = SubmitVoteSchema.parse(req.body);
    
    // 檢查投票是否存在且有效
    const vote = await VoteRepository.findVoteById(voteId);
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }
    
    if (vote.status !== 'active') {
      return res.status(400).json({ message: 'Vote is not active' });
    }
    
    if (vote.deadline && new Date() > vote.deadline) {
      return res.status(400).json({ message: 'Vote deadline has passed' });
    }
    
    // 檢查用戶是否有權限投票
    const hasAccess = await TripRepository.userHasAccess(vote.tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // 驗證選擇的選項是否有效
    const validOptionIds = vote.options.map(opt => opt.id);
    const invalidOptions = responseData.selectedOptions.filter(opt => !validOptionIds.includes(opt));
    if (invalidOptions.length > 0) {
      return res.status(400).json({ message: 'Invalid option IDs', invalid: invalidOptions });
    }
    
    // 檢查是否為多選投票
    if (!vote.settings.multipleChoice && responseData.selectedOptions.length > 1) {
      return res.status(400).json({ message: 'This vote does not allow multiple selections' });
    }
    
    const response = await VoteRepository.submitResponse({
      voteId,
      userId: req.user!.id,
      ...responseData
    });
    
    // 更新投票結果摘要
    await VoteRepository.updateResultSummary(voteId);
    
    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid response data', errors: error.issues });
    }
    console.error('Error submitting vote response:', error);
    res.status(500).json({ message: 'Failed to submit vote response' });
  }
});

// 其他投票相關 API 端點...

export default router;
```

---

## 🧠 NLP 解析服務

### 步驟 6: 實現基礎 NLP 服務

```typescript
// src/lib/nlp-parser.ts

import { getOpenAIClient } from './openai';

export interface ExtractedInfo {
  destinations: string[];
  dates: Date[];
  budget: number | null;
  interests: string[];
  preferences: {
    accommodation: string[];
    transportation: string[];
    activities: string[];
  };
  mentions: {
    restaurants: string[];
    attractions: string[];
    hotels: string[];
  };
  intent: 'question' | 'suggestion' | 'complaint' | 'booking' | 'general';
  confidence: number;
}

export interface TravelIntent {
  type: 'add_destination' | 'set_budget' | 'suggest_activity' | 'vote_request' | 'general';
  entities: Record<string, any>;
  confidence: number;
}

export class NLPParserService {
  private openaiClient = getOpenAIClient();
  
  /**
   * 解析聊天訊息，提取旅遊相關資訊
   */
  async parseMessage(content: string): Promise<ExtractedInfo> {
    try {
      const prompt = `
        分析以下旅遊討論訊息，提取相關資訊並以 JSON 格式回覆：
        
        訊息: "${content}"
        
        請提取以下資訊：
        - destinations: 提及的地點名稱
        - dates: 提及的日期（ISO 格式）
        - budget: 提及的預算金額（數字）
        - interests: 興趣愛好
        - preferences: 偏好設定（住宿、交通、活動）
        - mentions: 具體提及的地點（餐廳、景點、飯店）
        - intent: 訊息意圖類型
        - confidence: 解析信心度 (0-1)
        
        範例回覆格式：
        {
          "destinations": ["東京", "京都"],
          "dates": ["2024-03-15"],
          "budget": 50000,
          "interests": ["文化", "美食"],
          "preferences": {
            "accommodation": ["飯店"],
            "transportation": ["地鐵"],
            "activities": ["參觀寺廟"]
          },
          "mentions": {
            "restaurants": ["築地市場"],
            "attractions": ["清水寺"],
            "hotels": []
          },
          "intent": "suggestion",
          "confidence": 0.85
        }
      `;
      
      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: "你是一個專業的旅遊規劃助手，專門解析旅遊討論內容。請只回覆有效的 JSON 格式。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });
      
      const result = response.choices[0].message?.content;
      if (!result) {
        throw new Error('No response from NLP service');
      }
      
      return JSON.parse(result);
    } catch (error) {
      console.error('Error parsing message:', error);
      // 回傳預設值
      return {
        destinations: [],
        dates: [],
        budget: null,
        interests: [],
        preferences: {
          accommodation: [],
          transportation: [],
          activities: []
        },
        mentions: {
          restaurants: [],
          attractions: [],
          hotels: []
        },
        intent: 'general',
        confidence: 0
      };
    }
  }
  
  /**
   * 從多則訊息中提取意圖
   */
  async extractIntentions(messages: ChatMessage[]): Promise<TravelIntent[]> {
    try {
      const recentMessages = messages.slice(-10); // 只分析最近 10 則訊息
      const messageTexts = recentMessages.map(m => m.content).join('\n');
      
      const prompt = `
        分析以下旅遊討論對話，識別用戶的旅遊規劃意圖：
        
        對話內容:
        ${messageTexts}
        
        請識別以下類型的意圖：
        - add_destination: 想要添加新景點
        - set_budget: 設定或討論預算
        - suggest_activity: 建議活動
        - vote_request: 需要群組投票決定
        - general: 一般討論
        
        回覆 JSON 陣列格式，包含 type, entities, confidence。
      `;
      
      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: "你是一個旅遊意圖分析專家。請只回覆有效的 JSON 陣列。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 800
      });
      
      const result = response.choices[0].message?.content;
      if (!result) {
        return [];
      }
      
      return JSON.parse(result);
    } catch (error) {
      console.error('Error extracting intentions:', error);
      return [];
    }
  }
  
  /**
   * 基於提取的資訊生成建議
   */
  async generateSuggestions(context: ExtractedInfo): Promise<AISuggestion[]> {
    if (context.confidence < 0.5) {
      return []; // 信心度太低，不提供建議
    }
    
    const suggestions: AISuggestion[] = [];
    
    // 基於目的地提供建議
    if (context.destinations.length > 0) {
      suggestions.push({
        type: 'destination_info',
        title: `關於 ${context.destinations.join('、')} 的資訊`,
        description: '我可以為您提供這些地點的詳細資訊和推薦活動',
        action: {
          type: 'get_destination_info',
          data: { destinations: context.destinations }
        }
      });
    }
    
    // 基於預算提供建議
    if (context.budget && context.budget > 0) {
      suggestions.push({
        type: 'budget_planning',
        title: '預算規劃建議',
        description: `基於您的 ${context.budget} 預算，我可以推薦合適的行程安排`,
        action: {
          type: 'create_budget_plan',
          data: { budget: context.budget }
        }
      });
    }
    
    // 基於意圖提供建議
    if (context.intent === 'booking') {
      suggestions.push({
        type: 'booking_assistance',
        title: '預訂協助',
        description: '我可以幫您搜尋和比較住宿、交通選項',
        action: {
          type: 'start_booking_search',
          data: { destinations: context.destinations }
        }
      });
    }
    
    return suggestions;
  }
}

export interface AISuggestion {
  type: string;
  title: string;
  description: string;
  action: {
    type: string;
    data: Record<string, any>;
  };
}

// 導出單例實例
export const nlpParser = new NLPParserService();
```

---

## 🧪 測試實現

### 步驟 7: 編寫單元測試

```typescript
// tests/unit/chat/chat-repository.test.ts

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ChatRepository } from '../../../src/models/chat';
import { testConnection } from '../../helpers/database';

describe('ChatRepository', () => {
  let testTripId: string;
  let testUserId: string;
  let testRoomId: string;
  
  beforeEach(async () => {
    // 設定測試資料
    testTripId = 'test-trip-id';
    testUserId = 'test-user-id';
  });
  
  afterEach(async () => {
    // 清理測試資料
    if (testRoomId) {
      await ChatRepository.deleteRoom(testRoomId);
    }
  });
  
  describe('createRoom', () => {
    it('should create a new chat room successfully', async () => {
      const roomData = {
        tripId: testTripId,
        name: 'Test Room',
        description: 'Test Description',
        createdBy: testUserId
      };
      
      const room = await ChatRepository.createRoom(roomData);
      testRoomId = room.id;
      
      expect(room).toBeDefined();
      expect(room.name).toBe(roomData.name);
      expect(room.tripId).toBe(roomData.tripId);
      expect(room.createdBy).toBe(roomData.createdBy);
    });
  });
  
  describe('createMessage', () => {
    beforeEach(async () => {
      const room = await ChatRepository.createRoom({
        tripId: testTripId,
        name: 'Test Room',
        createdBy: testUserId
      });
      testRoomId = room.id;
    });
    
    it('should create a new message successfully', async () => {
      const messageData = {
        roomId: testRoomId,
        userId: testUserId,
        content: 'Hello, world!',
        messageType: 'text' as const
      };
      
      const message = await ChatRepository.createMessage(messageData);
      
      expect(message).toBeDefined();
      expect(message.content).toBe(messageData.content);
      expect(message.roomId).toBe(messageData.roomId);
      expect(message.userId).toBe(messageData.userId);
    });
  });
  
  describe('getMessages', () => {
    beforeEach(async () => {
      const room = await ChatRepository.createRoom({
        tripId: testTripId,
        name: 'Test Room',
        createdBy: testUserId
      });
      testRoomId = room.id;
      
      // 創建一些測試訊息
      for (let i = 1; i <= 5; i++) {
        await ChatRepository.createMessage({
          roomId: testRoomId,
          userId: testUserId,
          content: `Test message ${i}`
        });
      }
    });
    
    it('should retrieve messages with pagination', async () => {
      const messages = await ChatRepository.getMessages(testRoomId, { limit: 3 });
      
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toContain('Test message');
    });
    
    it('should search messages by content', async () => {
      const messages = await ChatRepository.searchMessages(testRoomId, 'message 3');
      
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Test message 3');
    });
  });
});
```

```typescript
// tests/unit/nlp/nlp-parser.test.ts

import { describe, it, expect } from '@jest/globals';
import { NLPParserService } from '../../../src/lib/nlp-parser';

describe('NLPParserService', () => {
  let nlpService: NLPParserService;
  
  beforeEach(() => {
    nlpService = new NLPParserService();
  });
  
  describe('parseMessage', () => {
    it('should extract destinations from message', async () => {
      const message = '我想去東京和京都旅行，預算大概是5萬元';
      
      const result = await nlpService.parseMessage(message);
      
      expect(result.destinations).toContain('東京');
      expect(result.destinations).toContain('京都');
      expect(result.budget).toBe(50000);
      expect(result.confidence).toBeGreaterThan(0.5);
    });
    
    it('should identify travel intent correctly', async () => {
      const message = '大家覺得我們應該選哪個餐廳？要不要投票決定？';
      
      const result = await nlpService.parseMessage(message);
      
      expect(result.intent).toBe('vote_request');
      expect(result.mentions.restaurants.length).toBeGreaterThan(0);
    });
  });
  
  describe('generateSuggestions', () => {
    it('should generate destination suggestions when destinations are mentioned', async () => {
      const context = {
        destinations: ['東京'],
        dates: [],
        budget: null,
        interests: [],
        preferences: {
          accommodation: [],
          transportation: [],
          activities: []
        },
        mentions: {
          restaurants: [],
          attractions: [],
          hotels: []
        },
        intent: 'suggestion' as const,
        confidence: 0.8
      };
      
      const suggestions = await nlpService.generateSuggestions(context);
      
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].type).toBe('destination_info');
    });
  });
});
```

---

## 🚀 整合與部署

### 步驟 8: 更新主要伺服器配置

```typescript
// src/server.ts (更新)

import express from 'express';
import { runMigrations } from './lib/migrations';
import { testConnection } from './config/database';
import { tripEventProcessor } from './features/trips/trip-event-processor';

const app = express();
const port = process.env.PORT || 3000;

// Import routes
import tripsRouter from './api/routes/trips';
import usersRouter from './api/routes/users';
import collaborationRouter from './api/routes/collaboration';
import aiRouter from './api/routes/ai';
import authRouter from './api/routes/auth';
import chatRouter from './api/routes/chat';       // 新增
import votesRouter from './api/routes/votes';     // 新增

// ... 現有的中介軟體設定 ...

// API routes
app.use('/api/auth', authRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/users', usersRouter);
app.use('/api/collaboration', collaborationRouter);
app.use('/api/ai', aiRouter);
app.use('/api/chat', chatRouter);                 // 新增
app.use('/api/votes', votesRouter);               // 新增

// ... 其餘設定保持不變 ...
```

### 步驟 9: 環境變數配置

```bash
# .env (新增設定)

# OpenAI API (用於 NLP 解析)
AZURE_OPENAI_ENDPOINT=your_azure_openai_endpoint
AZURE_OPENAI_API_KEY=your_azure_openai_key
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4

# WebPubSub (即時通訊)
AZURE_WEB_PUBSUB_CONNECTION_STRING=your_webpubsub_connection_string
AZURE_WEB_PUBSUB_HUB_NAME=chat

# 資料庫
DATABASE_URL=your_postgresql_connection_string

# Redis (快取)
REDIS_URL=your_redis_connection_string
```

---

## ✅ 驗收標準

### 功能驗收
- [ ] 可以成功創建和管理聊天室
- [ ] 即時訊息傳送正常運作
- [ ] 成員權限控制正確實施
- [ ] 投票創建和投票功能完整
- [ ] NLP 解析能提取基本旅遊資訊
- [ ] 快速指令解析正常運作

### 性能驗收
- [ ] 訊息發送延遲 < 200ms
- [ ] API 回應時間 < 500ms
- [ ] 支援至少 100 個併發用戶
- [ ] 資料庫查詢有適當索引

### 測試驗收
- [ ] 單元測試覆蓋率 > 80%
- [ ] 所有 API 端點有整合測試
- [ ] 錯誤處理機制完整
- [ ] 輸入驗證正確實施

---

## 🔄 下一階段預告

完成第一階段後，第二階段將實現：
1. 智能預算管理系統
2. 外部 API 整合 (天氣、匯率、地圖)
3. 通知推送系統
4. OCR 收據辨識功能

這個實施指南提供了詳細的程式碼範例和逐步指導，確保開發團隊能夠順利完成第一階段的核心功能開發。
