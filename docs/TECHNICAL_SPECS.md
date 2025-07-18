# 技術規格文檔 - 資料庫架構與 API 設計

## 📊 完整資料庫架構

### 1. 聊天與協作模組

```sql
-- ============================================================================
-- 聊天室系統
-- ============================================================================

-- 聊天室表
CREATE TABLE chat_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- 索引
    INDEX idx_chat_rooms_trip_id (trip_id),
    INDEX idx_chat_rooms_created_by (created_by)
);

-- 聊天訊息表
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text', 
    -- text, system, ai_suggestion, vote, command_result, expense_notification
    metadata JSONB DEFAULT '{}', 
    -- 存儲 NLP 解析結果、AI 建議、投票數據等
    replied_to UUID REFERENCES chat_messages(id),
    edited_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- 索引
    INDEX idx_chat_messages_room_id_created_at (room_id, created_at DESC),
    INDEX idx_chat_messages_user_id (user_id),
    INDEX idx_chat_messages_type (message_type),
    
    -- 全文搜索
    FULLTEXT INDEX ft_chat_messages_content (content)
);

-- 聊天室成員表
CREATE TABLE chat_room_members (
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(50) DEFAULT 'member', -- admin, member, viewer
    permissions JSONB DEFAULT '["read", "write"]', -- read, write, manage, vote
    joined_at TIMESTAMP DEFAULT NOW(),
    last_read_at TIMESTAMP DEFAULT NOW(),
    notification_enabled BOOLEAN DEFAULT TRUE,
    
    PRIMARY KEY (room_id, user_id),
    INDEX idx_room_members_user_id (user_id)
);

-- ============================================================================
-- 投票系統
-- ============================================================================

-- 投票表
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    chat_message_id UUID REFERENCES chat_messages(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    vote_type VARCHAR(50) NOT NULL, 
    -- destination, restaurant, activity, budget, accommodation, transportation
    options JSONB NOT NULL, 
    -- [{"id": "1", "name": "選項A", "description": "...", "metadata": {...}}]
    settings JSONB DEFAULT '{}',
    -- {"multiple_choice": false, "anonymous": false, "change_vote": true}
    creator_id UUID NOT NULL REFERENCES users(id),
    deadline TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active', -- active, closed, cancelled
    result_summary JSONB, -- 投票結果摘要
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_votes_trip_id (trip_id),
    INDEX idx_votes_status_deadline (status, deadline),
    INDEX idx_votes_creator_id (creator_id)
);

-- 投票回應表
CREATE TABLE vote_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vote_id UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    selected_options JSONB NOT NULL, -- ["option1", "option2"] for multiple choice
    ranking JSONB, -- 排序投票時使用
    comment TEXT,
    is_anonymous BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(vote_id, user_id),
    INDEX idx_vote_responses_vote_id (vote_id),
    INDEX idx_vote_responses_user_id (user_id)
);
```

### 2. 智能預算管理系統

```sql
-- ============================================================================
-- 預算與消費系統
-- ============================================================================

-- 預算設定表
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    category VARCHAR(100), -- NULL 代表總預算
    total_amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    spent_amount DECIMAL(12,2) DEFAULT 0,
    allocated_amount DECIMAL(12,2) DEFAULT 0, -- 已分配但未消費
    alert_thresholds JSONB DEFAULT '{"warning": 0.8, "critical": 0.95}',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_budgets_trip_id (trip_id),
    INDEX idx_budgets_category (category),
    UNIQUE(trip_id, category) -- 每個旅程每個類別只能有一個預算
);

-- 消費記錄表
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id), -- 記錄者
    payer_id UUID NOT NULL REFERENCES users(id), -- 付款者
    title VARCHAR(255) NOT NULL,
    description TEXT,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    base_currency VARCHAR(3) NOT NULL, -- 旅程基準貨幣
    base_amount DECIMAL(12,2) NOT NULL, -- 轉換為基準貨幣
    exchange_rate DECIMAL(10,6), -- 當時匯率
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    tags JSONB DEFAULT '[]', -- 標籤陣列
    
    -- 位置資訊
    location JSONB, 
    -- {"lat": 123.456, "lng": 78.901, "address": "...", "place_id": "..."}
    
    -- 收據資訊
    receipt_images JSONB DEFAULT '[]', -- 收據圖片 URL 陣列
    receipt_data JSONB, -- OCR 解析結果
    
    -- 時間資訊
    expense_date DATE NOT NULL,
    expense_time TIME,
    
    -- 分帳資訊
    participants JSONB NOT NULL, -- 參與分帳的用戶 ID 陣列
    split_method VARCHAR(50) DEFAULT 'equal', 
    -- equal, percentage, custom, shares, none
    split_data JSONB DEFAULT '{}', 
    -- 分帳詳細資料，例如: {"user1": 0.6, "user2": 0.4} 或 {"user1": 100, "user2": 150}
    
    -- 狀態
    status VARCHAR(50) DEFAULT 'active', -- active, cancelled, merged
    verification_status VARCHAR(50) DEFAULT 'pending', -- pending, verified, disputed
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- 索引
    INDEX idx_expenses_trip_id_date (trip_id, expense_date DESC),
    INDEX idx_expenses_user_id (user_id),
    INDEX idx_expenses_payer_id (payer_id),
    INDEX idx_expenses_category (category),
    INDEX idx_expenses_status (status),
    
    -- 全文搜索
    FULLTEXT INDEX ft_expenses_title_description (title, description)
);

-- 分帳詳細記錄表
CREATE TABLE expense_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id), -- 應付款人
    payer_id UUID NOT NULL REFERENCES users(id), -- 實際付款人
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    base_amount DECIMAL(12,2) NOT NULL,
    percentage DECIMAL(5,2), -- 分帳比例
    
    -- 狀態追蹤
    status VARCHAR(50) DEFAULT 'pending', 
    -- pending, acknowledged, paid, waived, disputed
    acknowledged_at TIMESTAMP,
    paid_at TIMESTAMP,
    payment_method VARCHAR(100), -- cash, transfer, digital_wallet, etc.
    payment_reference VARCHAR(255), -- 付款參考號
    
    -- 備註
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_expense_splits_expense_id (expense_id),
    INDEX idx_expense_splits_user_id (user_id),
    INDEX idx_expense_splits_payer_id (payer_id),
    INDEX idx_expense_splits_status (status),
    
    UNIQUE(expense_id, user_id) -- 每筆費用每個用戶只能有一條分帳記錄
);

-- 結算記錄表
CREATE TABLE settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    from_user_id UUID NOT NULL REFERENCES users(id),
    to_user_id UUID NOT NULL REFERENCES users(id),
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    
    -- 結算方式
    method VARCHAR(100), -- cash, bank_transfer, digital_wallet, external_app
    reference VARCHAR(255), -- 外部參考號 (如 PayPal transaction ID)
    
    -- 狀態
    status VARCHAR(50) DEFAULT 'pending', 
    -- pending, completed, cancelled, failed
    
    -- 時間記錄
    initiated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    
    -- 備註
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_settlements_trip_id (trip_id),
    INDEX idx_settlements_from_user (from_user_id),
    INDEX idx_settlements_to_user (to_user_id),
    INDEX idx_settlements_status (status)
);
```

### 3. 通知系統

```sql
-- ============================================================================
-- 通知與提醒系統
-- ============================================================================

-- 通知模板表
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL, 
    -- travel, budget, collaboration, booking, weather, system
    
    -- 模板內容
    title_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    action_template JSONB, -- 按鈕或動作配置
    
    -- 支援的通道
    supported_channels JSONB NOT NULL DEFAULT '["push", "email", "websocket"]',
    
    -- 設定
    default_enabled BOOLEAN DEFAULT TRUE,
    priority VARCHAR(50) DEFAULT 'normal', -- low, normal, high, urgent
    batch_interval_minutes INTEGER DEFAULT 0, -- 0 表示即時發送
    
    -- 條件與觸發
    trigger_conditions JSONB, -- 觸發條件
    scheduling_rules JSONB, -- 排程規則
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_notification_templates_type (type),
    INDEX idx_notification_templates_category (category)
);

-- 用戶通知設定表
CREATE TABLE user_notification_settings (
    user_id UUID NOT NULL REFERENCES users(id),
    notification_type VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    channels JSONB NOT NULL DEFAULT '["push"]',
    
    -- 時間設定
    advance_minutes INTEGER DEFAULT 15, -- 提前通知時間
    quiet_hours JSONB, -- {"start": "22:00", "end": "08:00"}
    timezone VARCHAR(100) DEFAULT 'UTC',
    
    -- 頻率控制
    max_daily_count INTEGER DEFAULT 50,
    batch_digest BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    PRIMARY KEY (user_id, notification_type),
    INDEX idx_user_notification_settings_user_id (user_id)
);

-- 通知佇列表
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    trip_id UUID REFERENCES trips(id),
    
    -- 通知內容
    type VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}', -- 額外資料
    actions JSONB, -- 可執行的動作
    
    -- 發送設定
    channels JSONB NOT NULL,
    priority VARCHAR(50) DEFAULT 'normal',
    
    -- 排程
    scheduled_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP,
    
    -- 狀態追蹤
    status VARCHAR(50) DEFAULT 'scheduled', 
    -- scheduled, sent, delivered, read, clicked, failed, cancelled, expired
    
    -- 發送記錄
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    clicked_at TIMESTAMP,
    
    -- 錯誤處理
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- 索引
    INDEX idx_notifications_user_id_status (user_id, status),
    INDEX idx_notifications_trip_id (trip_id),
    INDEX idx_notifications_scheduled_at (scheduled_at),
    INDEX idx_notifications_type (type),
    INDEX idx_notifications_status (status)
);

-- 通知發送記錄表 (用於統計與分析)
CREATE TABLE notification_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id),
    channel VARCHAR(50) NOT NULL,
    provider VARCHAR(100), -- firebase, apns, sendgrid, etc.
    
    -- 發送狀態
    status VARCHAR(50) NOT NULL,
    provider_message_id VARCHAR(255),
    
    -- 時間記錄
    attempted_at TIMESTAMP NOT NULL,
    delivered_at TIMESTAMP,
    
    -- 錯誤資訊
    error_code VARCHAR(100),
    error_message TEXT,
    
    -- 統計資料
    response_time_ms INTEGER,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_delivery_logs_notification_id (notification_id),
    INDEX idx_delivery_logs_channel_status (channel, status),
    INDEX idx_delivery_logs_attempted_at (attempted_at)
);
```

### 4. 外部服務快取

```sql
-- ============================================================================
-- 外部服務資料快取
-- ============================================================================

-- 天氣資料快取表
CREATE TABLE weather_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_key VARCHAR(255) NOT NULL, -- 地點的唯一標識 (可以是座標或地名)
    provider VARCHAR(100) NOT NULL, -- openweathermap, weatherapi, etc.
    
    -- 天氣資料
    current_weather JSONB NOT NULL,
    forecast_data JSONB, -- 未來幾天預報
    alerts JSONB DEFAULT '[]', -- 天氣警報
    
    -- 快取控制
    expires_at TIMESTAMP NOT NULL,
    last_updated TIMESTAMP DEFAULT NOW(),
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_weather_cache_location (location_key),
    INDEX idx_weather_cache_expires (expires_at),
    UNIQUE(location_key, provider)
);

-- 匯率快取表
CREATE TABLE exchange_rate_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency VARCHAR(3) NOT NULL,
    target_currency VARCHAR(3) NOT NULL,
    provider VARCHAR(100) NOT NULL,
    
    -- 匯率資料
    rate DECIMAL(12,6) NOT NULL,
    historical_rates JSONB, -- 歷史匯率
    
    -- 快取控制
    rate_date DATE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    last_updated TIMESTAMP DEFAULT NOW(),
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_exchange_rate_cache_currencies (base_currency, target_currency),
    INDEX idx_exchange_rate_cache_date (rate_date),
    INDEX idx_exchange_rate_cache_expires (expires_at),
    UNIQUE(base_currency, target_currency, rate_date, provider)
);

-- 地點資訊快取表
CREATE TABLE places_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id VARCHAR(255) NOT NULL, -- Google Place ID 或其他唯一標識
    provider VARCHAR(100) NOT NULL,
    
    -- 地點資料
    place_data JSONB NOT NULL,
    photos JSONB DEFAULT '[]',
    reviews JSONB DEFAULT '[]',
    opening_hours JSONB,
    
    -- 快取控制
    expires_at TIMESTAMP NOT NULL,
    last_updated TIMESTAMP DEFAULT NOW(),
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_places_cache_place_id (place_id),
    INDEX idx_places_cache_expires (expires_at),
    UNIQUE(place_id, provider)
);
```

## 🔌 完整 API 端點設計

### 1. 聊天與協作 API

```typescript
// src/api/routes/chat.ts

interface ChatAPI {
  // ============================================================================
  // 聊天室管理
  // ============================================================================
  
  /** 獲取旅程的所有聊天室 */
  'GET /api/trips/:tripId/chat/rooms': {
    query?: {
      include_members?: boolean;
      include_last_message?: boolean;
    };
    response: ChatRoom[];
  };
  
  /** 創建新聊天室 */
  'POST /api/trips/:tripId/chat/rooms': {
    body: {
      name: string;
      description?: string;
      is_default?: boolean;
    };
    response: ChatRoom;
  };
  
  /** 更新聊天室資訊 */
  'PUT /api/chat/rooms/:roomId': {
    body: {
      name?: string;
      description?: string;
    };
    response: ChatRoom;
  };
  
  /** 刪除聊天室 */
  'DELETE /api/chat/rooms/:roomId': {
    response: { success: boolean };
  };
  
  // ============================================================================
  // 消息管理
  // ============================================================================
  
  /** 獲取聊天室消息 */
  'GET /api/chat/rooms/:roomId/messages': {
    query?: {
      limit?: number; // default: 50
      before?: string; // message ID for pagination
      after?: string;
      types?: string[]; // message types to filter
      search?: string; // full-text search
    };
    response: {
      messages: ChatMessage[];
      has_more: boolean;
      next_cursor?: string;
    };
  };
  
  /** 發送消息 */
  'POST /api/chat/rooms/:roomId/messages': {
    body: {
      content: string;
      message_type?: 'text' | 'system' | 'command';
      metadata?: Record<string, any>;
      replied_to?: string; // message ID
    };
    response: ChatMessage;
  };
  
  /** 編輯消息 */
  'PUT /api/chat/messages/:messageId': {
    body: {
      content: string;
    };
    response: ChatMessage;
  };
  
  /** 刪除消息 */
  'DELETE /api/chat/messages/:messageId': {
    response: { success: boolean };
  };
  
  /** 標記消息為已讀 */
  'POST /api/chat/rooms/:roomId/read': {
    body: {
      message_id: string;
    };
    response: { success: boolean };
  };
  
  // ============================================================================
  // 成員管理
  // ============================================================================
  
  /** 獲取聊天室成員 */
  'GET /api/chat/rooms/:roomId/members': {
    response: ChatRoomMember[];
  };
  
  /** 添加成員到聊天室 */
  'POST /api/chat/rooms/:roomId/members': {
    body: {
      user_id: string;
      role?: 'admin' | 'member' | 'viewer';
      permissions?: string[];
    };
    response: ChatRoomMember;
  };
  
  /** 更新成員權限 */
  'PUT /api/chat/rooms/:roomId/members/:userId': {
    body: {
      role?: 'admin' | 'member' | 'viewer';
      permissions?: string[];
    };
    response: ChatRoomMember;
  };
  
  /** 移除成員 */
  'DELETE /api/chat/rooms/:roomId/members/:userId': {
    response: { success: boolean };
  };
}
```

### 2. 投票系統 API

```typescript
// src/api/routes/votes.ts

interface VoteAPI {
  // ============================================================================
  // 投票管理
  // ============================================================================
  
  /** 獲取旅程的投票列表 */
  'GET /api/trips/:tripId/votes': {
    query?: {
      status?: 'active' | 'closed' | 'cancelled';
      type?: string;
      include_results?: boolean;
    };
    response: Vote[];
  };
  
  /** 創建新投票 */
  'POST /api/trips/:tripId/votes': {
    body: {
      title: string;
      description?: string;
      vote_type: string;
      options: VoteOption[];
      settings?: VoteSettings;
      deadline?: string; // ISO datetime
      chat_message_id?: string;
    };
    response: Vote;
  };
  
  /** 獲取投票詳情 */
  'GET /api/votes/:voteId': {
    query?: {
      include_responses?: boolean;
      include_results?: boolean;
    };
    response: VoteDetail;
  };
  
  /** 更新投票 */
  'PUT /api/votes/:voteId': {
    body: {
      title?: string;
      description?: string;
      deadline?: string;
      status?: 'active' | 'closed' | 'cancelled';
    };
    response: Vote;
  };
  
  /** 刪除投票 */
  'DELETE /api/votes/:voteId': {
    response: { success: boolean };
  };
  
  // ============================================================================
  // 投票回應
  // ============================================================================
  
  /** 提交投票 */
  'POST /api/votes/:voteId/responses': {
    body: {
      selected_options: string[];
      ranking?: Record<string, number>;
      comment?: string;
      is_anonymous?: boolean;
    };
    response: VoteResponse;
  };
  
  /** 更新投票回應 */
  'PUT /api/votes/:voteId/responses': {
    body: {
      selected_options: string[];
      ranking?: Record<string, number>;
      comment?: string;
    };
    response: VoteResponse;
  };
  
  /** 撤回投票 */
  'DELETE /api/votes/:voteId/responses': {
    response: { success: boolean };
  };
  
  /** 獲取投票結果 */
  'GET /api/votes/:voteId/results': {
    response: VoteResults;
  };
}
```

### 3. 預算管理 API

```typescript
// src/api/routes/expenses.ts

interface ExpenseAPI {
  // ============================================================================
  // 預算管理
  // ============================================================================
  
  /** 獲取旅程預算 */
  'GET /api/trips/:tripId/budget': {
    response: {
      total_budget: Budget;
      category_budgets: Budget[];
      summary: BudgetSummary;
    };
  };
  
  /** 設定/更新預算 */
  'PUT /api/trips/:tripId/budget': {
    body: {
      total_amount?: number;
      currency?: string;
      category_budgets?: Array<{
        category: string;
        amount: number;
      }>;
      alert_thresholds?: {
        warning: number;
        critical: number;
      };
    };
    response: Budget;
  };
  
  /** 獲取預算警告 */
  'GET /api/trips/:tripId/budget/alerts': {
    response: BudgetAlert[];
  };
  
  // ============================================================================
  // 消費記錄
  // ============================================================================
  
  /** 獲取消費記錄 */
  'GET /api/trips/:tripId/expenses': {
    query?: {
      category?: string;
      date_from?: string;
      date_to?: string;
      payer_id?: string;
      participant_id?: string;
      status?: string;
      limit?: number;
      offset?: number;
      sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
      include_splits?: boolean;
    };
    response: {
      expenses: Expense[];
      total_count: number;
      summary: ExpenseSummary;
    };
  };
  
  /** 創建消費記錄 */
  'POST /api/trips/:tripId/expenses': {
    body: {
      title: string;
      description?: string;
      amount: number;
      currency: string;
      category: string;
      subcategory?: string;
      payer_id?: string; // default: current user
      participants: string[]; // user IDs
      split_method: 'equal' | 'percentage' | 'custom' | 'shares' | 'none';
      split_data?: Record<string, number>;
      expense_date: string; // ISO date
      expense_time?: string; // HH:MM
      location?: {
        lat: number;
        lng: number;
        address: string;
        place_id?: string;
      };
      tags?: string[];
    };
    response: Expense;
  };
  
  /** 更新消費記錄 */
  'PUT /api/expenses/:expenseId': {
    body: Partial<CreateExpenseRequest>;
    response: Expense;
  };
  
  /** 刪除消費記錄 */
  'DELETE /api/expenses/:expenseId': {
    response: { success: boolean };
  };
  
  /** 上傳收據圖片 */
  'POST /api/expenses/:expenseId/receipts': {
    body: FormData; // multipart/form-data with image files
    response: {
      receipt_urls: string[];
      ocr_data?: ReceiptOCRData;
    };
  };
  
  /** OCR 解析收據 */
  'POST /api/expenses/ocr-receipt': {
    body: FormData;
    response: ReceiptOCRData;
  };
  
  // ============================================================================
  // 分帳管理
  // ============================================================================
  
  /** 獲取分帳詳情 */
  'GET /api/trips/:tripId/splits': {
    query?: {
      user_id?: string;
      status?: string;
      include_settled?: boolean;
    };
    response: {
      splits: ExpenseSplit[];
      balances: UserBalance[];
      settlement_suggestions: SettlementSuggestion[];
    };
  };
  
  /** 重新計算分帳 */
  'POST /api/expenses/:expenseId/recalculate-split': {
    body: {
      split_method: string;
      split_data?: Record<string, number>;
      participants: string[];
    };
    response: Expense;
  };
  
  /** 確認分帳 */
  'POST /api/expense-splits/:splitId/acknowledge': {
    response: ExpenseSplit;
  };
  
  /** 標記分帳為已付 */
  'POST /api/expense-splits/:splitId/mark-paid': {
    body: {
      payment_method?: string;
      payment_reference?: string;
      notes?: string;
    };
    response: ExpenseSplit;
  };
  
  /** 創建結算記錄 */
  'POST /api/trips/:tripId/settlements': {
    body: {
      to_user_id: string;
      amount: number;
      currency: string;
      method?: string;
      reference?: string;
      notes?: string;
    };
    response: Settlement;
  };
  
  /** 確認結算 */
  'POST /api/settlements/:settlementId/confirm': {
    response: Settlement;
  };
  
  // ============================================================================
  // 報表與匯出
  // ============================================================================
  
  /** 獲取消費統計 */
  'GET /api/trips/:tripId/expenses/statistics': {
    query?: {
      group_by?: 'category' | 'date' | 'user' | 'location';
      period?: 'daily' | 'weekly' | 'monthly';
    };
    response: ExpenseStatistics;
  };
  
  /** 匯出消費報表 */
  'GET /api/trips/:tripId/expenses/export': {
    query: {
      format: 'csv' | 'pdf' | 'excel';
      include_receipts?: boolean;
    };
    response: Blob; // File download
  };
}
```

### 4. 外部服務整合 API

```typescript
// src/api/routes/external-services.ts

interface ExternalServicesAPI {
  // ============================================================================
  // 天氣服務
  // ============================================================================
  
  /** 獲取地點天氣 */
  'GET /api/external/weather': {
    query: {
      location?: string; // city name or address
      lat?: number;
      lng?: number;
      days?: number; // forecast days (1-7)
      units?: 'metric' | 'imperial';
    };
    response: WeatherData;
  };
  
  /** 獲取穿搭建議 */
  'GET /api/external/weather/clothing-suggestions': {
    query: {
      location?: string;
      lat?: number;
      lng?: number;
      date?: string; // ISO date
    };
    response: {
      suggestions: string[];
      weather_summary: string;
    };
  };
  
  // ============================================================================
  // 匯率服務
  // ============================================================================
  
  /** 獲取即時匯率 */
  'GET /api/external/exchange-rates': {
    query: {
      base: string; // base currency code
      target?: string; // target currency code, if not provided, returns all
      date?: string; // historical rate date
    };
    response: {
      base: string;
      date: string;
      rates: Record<string, number>;
    };
  };
  
  /** 貨幣轉換 */
  'POST /api/external/exchange-rates/convert': {
    body: {
      amount: number;
      from: string;
      to: string;
      date?: string;
    };
    response: {
      original_amount: number;
      converted_amount: number;
      exchange_rate: number;
      date: string;
    };
  };
  
  /** 獲取支援的貨幣列表 */
  'GET /api/external/exchange-rates/currencies': {
    response: Array<{
      code: string;
      name: string;
      symbol: string;
    }>;
  };
  
  // ============================================================================
  // 地圖與地點服務
  // ============================================================================
  
  /** 搜尋地點 */
  'GET /api/external/places/search': {
    query: {
      query: string;
      location?: string; // bias search around this location
      radius?: number; // search radius in meters
      type?: string; // place type filter
      language?: string;
    };
    response: {
      places: PlaceSearchResult[];
      next_page_token?: string;
    };
  };
  
  /** 獲取地點詳情 */
  'GET /api/external/places/:placeId': {
    query?: {
      fields?: string[]; // specify which fields to return
      language?: string;
    };
    response: PlaceDetails;
  };
  
  /** 獲取路線規劃 */
  'POST /api/external/directions': {
    body: {
      origin: string;
      destination: string;
      waypoints?: string[];
      mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
      departure_time?: string;
      language?: string;
    };
    response: DirectionsResult;
  };
  
  /** 計算距離矩陣 */
  'POST /api/external/distance-matrix': {
    body: {
      origins: string[];
      destinations: string[];
      mode?: string;
      departure_time?: string;
    };
    response: DistanceMatrixResult;
  };
  
  // ============================================================================
  // 預訂服務 (未來實現)
  // ============================================================================
  
  /** 搜尋航班 */
  'POST /api/external/flights/search': {
    body: FlightSearchRequest;
    response: FlightSearchResult;
  };
  
  /** 搜尋飯店 */
  'POST /api/external/hotels/search': {
    body: HotelSearchRequest;
    response: HotelSearchResult;
  };
}
```

### 5. 快速操作 API

```typescript
// src/api/routes/quick-actions.ts

interface QuickActionsAPI {
  // ============================================================================
  // 快速指令處理
  // ============================================================================
  
  /** 解析並執行快速指令 */
  'POST /api/trips/:tripId/quick-actions/execute-command': {
    body: {
      command: string; // e.g., "/weather Tokyo", "/budget add 100", "/vote restaurant"
      context?: {
        room_id?: string;
        message_id?: string;
      };
    };
    response: {
      success: boolean;
      result: CommandResult;
      response_message?: string;
    };
  };
  
  /** 獲取可用指令列表 */
  'GET /api/trips/:tripId/quick-actions/commands': {
    response: Array<{
      command: string;
      description: string;
      parameters: CommandParameter[];
      examples: string[];
    }>;
  };
  
  // ============================================================================
  // 快捷操作
  // ============================================================================
  
  /** AI 行程建議 */
  'POST /api/trips/:tripId/quick-actions/suggest-itinerary': {
    body: {
      preferences?: string[];
      budget?: number;
      duration?: number;
      interests?: string[];
    };
    response: ItinerarySuggestion;
  };
  
  /** 快速添加景點 */
  'POST /api/trips/:tripId/quick-actions/add-destination': {
    body: {
      name: string;
      date?: string;
      notes?: string;
    };
    response: Destination;
  };
  
  /** 快速記帳 */
  'POST /api/trips/:tripId/quick-actions/add-expense': {
    body: {
      amount: number;
      description: string;
      category?: string;
      participants?: string[];
    };
    response: Expense;
  };
  
  /** 平均分帳 */
  'POST /api/expenses/:expenseId/quick-actions/split-equally': {
    body: {
      participants?: string[]; // if not provided, use all trip members
    };
    response: Expense;
  };
  
  /** 獲取天氣資訊 */
  'POST /api/trips/:tripId/quick-actions/get-weather': {
    body: {
      destination?: string; // if not provided, use trip destinations
      date?: string;
    };
    response: {
      weather_summary: string;
      detailed_forecast: WeatherData;
      recommendations: string[];
    };
  };
  
  /** 匯出行程 */
  'POST /api/trips/:tripId/quick-actions/export-itinerary': {
    body: {
      format: 'pdf' | 'ical' | 'json';
      include_expenses?: boolean;
      include_weather?: boolean;
    };
    response: {
      download_url: string;
      expires_at: string;
    };
  };
  
  /** 創建投票 */
  'POST /api/trips/:tripId/quick-actions/create-vote': {
    body: {
      title: string;
      options: string[];
      vote_type?: string;
      deadline_hours?: number;
    };
    response: Vote;
  };
  
  /** 發送提醒 */
  'POST /api/trips/:tripId/quick-actions/send-reminder': {
    body: {
      message: string;
      recipients?: string[]; // user IDs, if not provided, send to all members
      schedule_minutes?: number; // send after X minutes, default: immediate
    };
    response: {
      notification_ids: string[];
      scheduled_at: string;
    };
  };
}
```

這份技術規格文檔提供了完整的資料庫架構設計和 API 端點規劃，涵蓋了協同旅行規劃系統的所有核心功能。每個表都包含了適當的索引設計，API 也提供了完整的型別定義和功能描述，為實際開發提供了詳細的技術指引。
