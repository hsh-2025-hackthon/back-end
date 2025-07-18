# 協同旅行規劃系統 - 後端實現計劃

## 📋 概述

本文檔詳細規劃了協同旅行規劃 AI 系統後端缺失功能的完整實現方案，基於當前已實現的核心功能，分階段完成剩餘的關鍵模組。

## 🎯 當前狀態分析

### ✅ 已實現功能
- 核心旅程管理 (CRUD)
- 即時協作系統 (Web PubSub + CRDT)
- AI 行程生成與推薦
- 用戶認證與權限管理
- 基礎架構 (Azure 服務整合)

### ❌ 待實現功能 (按優先級排序)

#### 🔴 **高優先級 (MVP 必需)**
1. 聊天室系統與 NLP 解析
2. 智能預算管理系統
3. 外部 API 整合 (MCP 層)
4. 通知提醒系統
5. 投票與快速操作

#### 🟡 **中優先級 (核心功能)**
6. 航班飯店預訂整合
7. 智能行程卡片系統
8. 進階 AI Agent 工作流
9. 版本控制與歷史記錄

#### 🟢 **低優先級 (增強功能)**
10. PDF 生成與列印輸出
11. 離線支援
12. 進階分析與報表

---

## 📅 實現時程規劃

### **第一週 (W1): 核心基礎建設**
- 聊天室系統架構
- 預算管理基礎模組
- MCP 整合層設計

### **第二週 (W2): 智能服務整合**
- 外部 API 整合 (天氣、匯率、地圖)
- NLP 解析與 AI 工作流
- 通知推送系統

### **第三週 (W3): 進階功能開發**
- 預訂整合系統
- 智能卡片與可視化
- 性能優化與測試

### **第四週 (W4): 整合測試與部署**
- 端到端測試
- 性能調優
- 文檔完善

---

## 🏗️ 詳細實現方案

## **階段一: 聊天室與協作增強 (W1 Day 1-3)**

### 1.1 多用戶聊天室系統

#### 資料庫設計
```sql
-- 聊天室表
CREATE TABLE chat_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 聊天訊息表
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text', -- text, system, ai_suggestion, vote
    metadata JSONB, -- 存儲 NLP 解析結果、投票數據等
    replied_to UUID REFERENCES chat_messages(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 聊天室成員表
CREATE TABLE chat_room_members (
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(50) DEFAULT 'member', -- admin, member, viewer
    joined_at TIMESTAMP DEFAULT NOW(),
    last_read_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);
```

#### API 端點設計
```typescript
// src/api/routes/chat.ts
interface ChatAPI {
  // 聊天室管理
  'GET /api/trips/:tripId/chat/rooms': GetChatRooms;
  'POST /api/trips/:tripId/chat/rooms': CreateChatRoom;
  'PUT /api/chat/rooms/:roomId': UpdateChatRoom;
  'DELETE /api/chat/rooms/:roomId': DeleteChatRoom;
  
  // 消息管理
  'GET /api/chat/rooms/:roomId/messages': GetMessages;
  'POST /api/chat/rooms/:roomId/messages': SendMessage;
  'PUT /api/chat/messages/:messageId': EditMessage;
  'DELETE /api/chat/messages/:messageId': DeleteMessage;
  
  // 成員管理
  'GET /api/chat/rooms/:roomId/members': GetRoomMembers;
  'POST /api/chat/rooms/:roomId/members': AddMember;
  'DELETE /api/chat/rooms/:roomId/members/:userId': RemoveMember;
}
```

#### 即時通訊整合
```typescript
// src/lib/chat-websocket.ts
export class ChatWebSocketService {
  private webPubSubClient: WebPubSubServiceClient;
  
  async broadcastMessage(roomId: string, message: ChatMessage): Promise<void>;
  async notifyTyping(roomId: string, userId: string): Promise<void>;
  async notifyUserJoined(roomId: string, user: User): Promise<void>;
  async sendAISuggestion(roomId: string, suggestion: AISuggestion): Promise<void>;
}
```

### 1.2 NLP 解析與智能提取

#### NLP 解析服務
```typescript
// src/lib/nlp-parser.ts
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
}

export class NLPParserService {
  async parseMessage(content: string): Promise<ExtractedInfo>;
  async extractIntentions(messages: ChatMessage[]): Promise<TravelIntent[]>;
  async generateSuggestions(context: ExtractedInfo): Promise<AISuggestion[]>;
}
```

### 1.3 投票機制

#### 投票系統資料結構
```sql
-- 投票表
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    chat_message_id UUID REFERENCES chat_messages(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    vote_type VARCHAR(50) NOT NULL, -- destination, restaurant, activity, budget
    options JSONB NOT NULL, -- [{"id": "1", "name": "景點A", "description": "..."}]
    creator_id UUID NOT NULL REFERENCES users(id),
    deadline TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active', -- active, closed, cancelled
    created_at TIMESTAMP DEFAULT NOW()
);

-- 投票選項表
CREATE TABLE vote_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vote_id UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    selected_options JSONB NOT NULL, -- ["option1", "option2"] for multiple choice
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(vote_id, user_id)
);
```

---

## **階段二: 智能預算管理系統 (W1 Day 4-7)**

### 2.1 消費記錄系統

#### 資料庫設計
```sql
-- 消費記錄表
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    amount_base_currency DECIMAL(10,2), -- 轉換為基準貨幣
    category VARCHAR(100) NOT NULL, -- transportation, food, accommodation, activity, shopping, other
    subcategory VARCHAR(100),
    description TEXT,
    receipt_image_url TEXT,
    receipt_data JSONB, -- OCR 解析結果
    location JSONB, -- {"lat": 123.456, "lng": 78.901, "address": "..."}
    expense_date DATE NOT NULL,
    participants JSONB NOT NULL, -- 參與分帳的用戶 ID 列表
    split_method VARCHAR(50) DEFAULT 'equal', -- equal, percentage, custom, none
    split_data JSONB, -- 分帳詳細資料
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 分帳記錄表
CREATE TABLE expense_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    amount_base_currency DECIMAL(10,2),
    paid_by_user_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'pending', -- pending, paid, cancelled
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 預算設定表
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    category VARCHAR(100), -- null for total budget
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    spent_amount DECIMAL(10,2) DEFAULT 0,
    alert_threshold DECIMAL(3,2) DEFAULT 0.8, -- 80% 警告
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### API 端點設計
```typescript
// src/api/routes/expenses.ts
interface ExpenseAPI {
  // 消費記錄
  'GET /api/trips/:tripId/expenses': GetExpenses;
  'POST /api/trips/:tripId/expenses': CreateExpense;
  'PUT /api/expenses/:expenseId': UpdateExpense;
  'DELETE /api/expenses/:expenseId': DeleteExpense;
  'POST /api/expenses/:expenseId/receipt': UploadReceipt;
  
  // 分帳管理
  'GET /api/trips/:tripId/splits': GetExpenseSplits;
  'POST /api/expenses/:expenseId/split': CalculateSplit;
  'PUT /api/splits/:splitId/status': UpdateSplitStatus;
  'GET /api/trips/:tripId/balances': GetMemberBalances;
  
  // 預算管理
  'GET /api/trips/:tripId/budget': GetBudget;
  'PUT /api/trips/:tripId/budget': UpdateBudget;
  'GET /api/trips/:tripId/budget/alerts': GetBudgetAlerts;
}
```

### 2.2 OCR 收據辨識

#### OCR 服務整合
```typescript
// src/lib/ocr-service.ts
export interface ReceiptData {
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
}

export class OCRService {
  private azureDocumentIntelligence: DocumentAnalysisClient;
  
  async analyzeReceipt(imageBuffer: Buffer): Promise<ReceiptData>;
  async extractText(imageBuffer: Buffer): Promise<string>;
  async validateReceiptData(data: ReceiptData): Promise<ReceiptData>;
}
```

### 2.3 匯率服務

#### 匯率 API 整合
```typescript
// src/lib/currency-service.ts
export class CurrencyService {
  private exchangeRateAPI: string = 'https://api.exchangerate-api.com/v4/latest/';
  
  async getCurrentRate(from: string, to: string): Promise<number>;
  async getHistoricalRate(from: string, to: string, date: Date): Promise<number>;
  async convertAmount(amount: number, from: string, to: string): Promise<number>;
  async getSupportedCurrencies(): Promise<string[]>;
  
  // 快取策略
  private async cacheExchangeRates(): Promise<void>;
  private async getCachedRate(from: string, to: string): Promise<number | null>;
}
```

---

## **階段三: 外部服務整合 (MCP) (W2 Day 1-4)**

### 3.1 MCP 架構設計

#### MCP 統一介面
```typescript
// src/lib/mcp/base-mcp.ts
export abstract class BaseMCP {
  abstract name: string;
  abstract version: string;
  
  abstract async initialize(): Promise<void>;
  abstract async healthCheck(): Promise<boolean>;
  abstract async rateLimit(): Promise<boolean>;
}

// MCP 管理器
export class MCPManager {
  private mcpServices: Map<string, BaseMCP> = new Map();
  
  async registerMCP(mcp: BaseMCP): Promise<void>;
  async getMCP<T extends BaseMCP>(name: string): Promise<T>;
  async executeWithFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T>;
}
```

### 3.2 天氣服務 MCP

```typescript
// src/lib/mcp/weather-mcp.ts
export interface WeatherData {
  current: {
    temperature: number;
    humidity: number;
    description: string;
    icon: string;
    feelsLike: number;
    windSpeed: number;
  };
  forecast: Array<{
    date: Date;
    maxTemp: number;
    minTemp: number;
    description: string;
    icon: string;
    precipitation: number;
  }>;
  alerts: Array<{
    type: string;
    severity: string;
    description: string;
    startTime: Date;
    endTime: Date;
  }>;
}

export class WeatherMCP extends BaseMCP {
  name = 'weather';
  private openWeatherMapAPI: string;
  
  async getWeather(location: string): Promise<WeatherData>;
  async getWeatherByCoords(lat: number, lng: number): Promise<WeatherData>;
  async getClothingRecommendation(weather: WeatherData): Promise<string[]>;
}
```

### 3.3 地圖服務 MCP

```typescript
// src/lib/mcp/maps-mcp.ts
export interface PlaceData {
  placeId: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };
  rating: number;
  reviews: number;
  photos: string[];
  openingHours: Array<{
    day: string;
    hours: string;
  }>;
  priceLevel: number;
  types: string[];
}

export class MapsMCP extends BaseMCP {
  name = 'maps';
  private googleMapsAPI: string;
  
  async searchPlaces(query: string, location?: string): Promise<PlaceData[]>;
  async getPlaceDetails(placeId: string): Promise<PlaceData>;
  async getDirections(origin: string, destination: string): Promise<RouteData>;
  async calculateTravelTime(origin: string, destination: string): Promise<number>;
}
```

### 3.4 旅遊資訊 MCP

```typescript
// src/lib/mcp/travel-info-mcp.ts
export class TravelInfoMCP extends BaseMCP {
  name = 'travel-info';
  
  async getAttractionInfo(name: string, location: string): Promise<AttractionData>;
  async getRestaurantInfo(name: string, location: string): Promise<RestaurantData>;
  async getTicketPrices(attraction: string): Promise<TicketPricing>;
  async getLocalEvents(location: string, dateRange: DateRange): Promise<Event[]>;
}
```

---

## **階段四: 通知提醒系統 (W2 Day 5-7)**

### 4.1 通知系統架構

#### 通知資料庫設計
```sql
-- 通知模板表
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL UNIQUE, -- travel_reminder, weather_alert, budget_warning, etc.
    title_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    channels JSONB NOT NULL, -- ["push", "email", "websocket"]
    default_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 用戶通知設定表
CREATE TABLE user_notification_settings (
    user_id UUID NOT NULL REFERENCES users(id),
    notification_type VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    channels JSONB NOT NULL, -- ["push", "email"]
    advance_minutes INTEGER, -- 提前多少分鐘通知
    PRIMARY KEY (user_id, notification_type)
);

-- 通知記錄表
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    trip_id UUID REFERENCES trips(id),
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB, -- 額外資料
    channels JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, sent, failed, read
    scheduled_at TIMESTAMP,
    sent_at TIMESTAMP,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### 通知服務實現
```typescript
// src/lib/notification-service.ts
export class NotificationService {
  async scheduleNotification(notification: ScheduleNotificationRequest): Promise<void>;
  async sendImmediateNotification(notification: ImmediateNotificationRequest): Promise<void>;
  async cancelNotification(notificationId: string): Promise<void>;
  
  // 特定類型通知
  async sendTravelReminder(trip: Trip, user: User, reminder: TravelReminder): Promise<void>;
  async sendWeatherAlert(trip: Trip, users: User[], weather: WeatherAlert): Promise<void>;
  async sendBudgetWarning(trip: Trip, user: User, budget: BudgetAlert): Promise<void>;
  async sendFlightStatusUpdate(trip: Trip, users: User[], flight: FlightUpdate): Promise<void>;
}
```

### 4.2 推播通知整合

#### 多平台推播服務
```typescript
// src/lib/push-notification.ts
export class PushNotificationService {
  private firebaseAdmin: admin.messaging.Messaging;
  private apnsProvider: apn.Provider;
  
  async sendToDevice(token: string, notification: PushNotification): Promise<void>;
  async sendToTopic(topic: string, notification: PushNotification): Promise<void>;
  async subscribeToTopic(tokens: string[], topic: string): Promise<void>;
}
```

---

## **階段五: 快速操作與指令系統 (W3 Day 1-2)**

### 5.1 快速指令處理

#### 指令解析器
```typescript
// src/lib/command-parser.ts
export interface Command {
  type: string;
  action: string;
  parameters: Record<string, any>;
  context: {
    tripId: string;
    userId: string;
    roomId: string;
  };
}

export class CommandParser {
  private commands: Map<string, CommandHandler> = new Map();
  
  async parseCommand(message: string, context: CommandContext): Promise<Command | null>;
  async executeCommand(command: Command): Promise<CommandResult>;
  
  // 預定義指令
  private weatherCommand = async (params: any): Promise<CommandResult>;
  private budgetCommand = async (params: any): Promise<CommandResult>;
  private addDestinationCommand = async (params: any): Promise<CommandResult>;
  private splitBillCommand = async (params: any): Promise<CommandResult>;
  private exportCommand = async (params: any): Promise<CommandResult>;
}
```

### 5.2 快捷操作 API

```typescript
// src/api/routes/quick-actions.ts
interface QuickActionAPI {
  'POST /api/trips/:tripId/quick-actions/suggest-itinerary': SuggestItinerary;
  'POST /api/trips/:tripId/quick-actions/add-destination': AddDestination;
  'POST /api/trips/:tripId/quick-actions/split-expense': SplitExpense;
  'POST /api/trips/:tripId/quick-actions/get-weather': GetWeather;
  'POST /api/trips/:tripId/quick-actions/export-itinerary': ExportItinerary;
  'POST /api/trips/:tripId/quick-actions/create-vote': CreateVote;
}
```

---

## **階段六: 航班飯店預訂整合 (W3 Day 3-5)**

### 6.1 預訂搜尋系統

#### 搜尋 API 設計
```typescript
// src/lib/booking/search-service.ts
export interface FlightSearchRequest {
  origin: string;
  destination: string;
  departureDate: Date;
  returnDate?: Date;
  passengers: number;
  class: 'economy' | 'business' | 'first';
  budget?: number;
}

export interface HotelSearchRequest {
  destination: string;
  checkIn: Date;
  checkOut: Date;
  rooms: number;
  guests: number;
  budget?: number;
  amenities?: string[];
}

export class BookingSearchService {
  async searchFlights(request: FlightSearchRequest): Promise<FlightSearchResult[]>;
  async searchHotels(request: HotelSearchRequest): Promise<HotelSearchResult[]>;
  async getBookingDetails(bookingId: string, provider: string): Promise<BookingDetails>;
}
```

### 6.2 比價系統

#### 多平台整合
```typescript
// src/lib/booking/providers/
export abstract class BookingProvider {
  abstract name: string;
  abstract async searchFlights(request: FlightSearchRequest): Promise<FlightResult[]>;
  abstract async searchHotels(request: HotelSearchRequest): Promise<HotelResult[]>;
  abstract async getBookingUrl(result: SearchResult): Promise<string>;
}

export class SkyscannerProvider extends BookingProvider { /* ... */ }
export class BookingComProvider extends BookingProvider { /* ... */ }
export class ExpediaProvider extends BookingProvider { /* ... */ }
```

---

## **階段七: 智能行程卡片系統 (W3 Day 6-7)**

### 7.1 智能卡片生成

#### 卡片資料結構
```typescript
// src/models/itinerary-card.ts
export interface ItineraryCard {
  id: string;
  tripId: string;
  date: Date;
  sequence: number;
  location: {
    name: string;
    coordinates: { lat: number; lng: number };
    address: string;
  };
  activity: {
    name: string;
    description: string;
    duration: number; // minutes
    category: string;
    estimatedCost: number;
    currency: string;
  };
  weather: WeatherData;
  transportation: {
    method: string;
    duration: number;
    cost: number;
    instructions: string;
  };
  enrichments: {
    openingHours: string;
    rating: number;
    photos: string[];
    tips: string[];
  };
}
```

#### 卡片生成服務
```typescript
// src/lib/card-generator.ts
export class ItineraryCardGenerator {
  async generateCard(
    destination: Destination,
    date: Date,
    context: TripContext
  ): Promise<ItineraryCard>;
  
  async enrichWithWeather(card: ItineraryCard): Promise<ItineraryCard>;
  async enrichWithCurrency(card: ItineraryCard): Promise<ItineraryCard>;
  async enrichWithTransportation(card: ItineraryCard): Promise<ItineraryCard>;
  async enrichWithRealtimeData(card: ItineraryCard): Promise<ItineraryCard>;
}
```

---

## **階段八: PDF 生成與輸出 (W4 Day 1-2)**

### 8.1 PDF 生成服務

```typescript
// src/lib/pdf-generator.ts
export class PDFGeneratorService {
  async generateTravelGuide(trip: Trip): Promise<Buffer>;
  async generateItinerary(trip: Trip, options: PDFOptions): Promise<Buffer>;
  async generateExpenseReport(trip: Trip): Promise<Buffer>;
  
  private async renderTemplate(template: string, data: any): Promise<string>;
  private async htmlToPDF(html: string, options: PDFOptions): Promise<Buffer>;
}
```

---

## **階段九: 進階 AI Agent 工作流 (W4 Day 3-4)**

### 9.1 Agent 協調系統

```typescript
// src/lib/agents/agent-coordinator.ts
export class AgentCoordinator {
  private agents: Map<string, BaseAgent> = new Map();
  
  async processUserIntent(intent: UserIntent): Promise<AgentResult>;
  async coordinateAgents(workflow: AgentWorkflow): Promise<WorkflowResult>;
  async handleConflicts(conflicts: AgentConflict[]): Promise<Resolution>;
}

// 各類 Agent 實現
export class RequirementAnalysisAgent extends BaseAgent { /* ... */ }
export class DataQueryAgent extends BaseAgent { /* ... */ }
export class ItineraryOptimizationAgent extends BaseAgent { /* ... */ }
export class AdaptiveAdjustmentAgent extends BaseAgent { /* ... */ }
```

---

## 📊 測試策略

### 單元測試
```typescript
// tests/unit/
- services/expense-service.test.ts
- lib/mcp/weather-mcp.test.ts
- lib/notification-service.test.ts
- lib/command-parser.test.ts
```

### 整合測試
```typescript
// tests/integration/
- api/chat-endpoints.test.ts
- api/expense-endpoints.test.ts
- external-services/mcp-integration.test.ts
```

### 端到端測試
```typescript
// tests/e2e/
- complete-trip-workflow.test.ts
- collaboration-features.test.ts
- booking-integration.test.ts
```

---

## 🚀 部署與監控

### 環境配置
```yaml
# .env.production
# MCP 服務配置
OPENWEATHERMAP_API_KEY=
GOOGLE_MAPS_API_KEY=
EXCHANGERATE_API_KEY=
SKYSCANNER_API_KEY=
BOOKING_COM_API_KEY=

# 通知服務
FIREBASE_ADMIN_SDK_KEY=
APNS_KEY_PATH=
SENDGRID_API_KEY=

# 監控與日志
SENTRY_DSN=
NEW_RELIC_LICENSE_KEY=
```

### 監控指標
- API 回應時間
- 外部服務可用性
- 通知送達率
- 用戶活躍度
- 錯誤率與異常

---

## 📝 風險評估與緩解

### 技術風險
1. **外部 API 限制**: 實施多重備援與快取策略
2. **即時通訊性能**: 使用 Azure Web PubSub 的擴展能力
3. **資料同步衝突**: CRDT 機制確保最終一致性

### 業務風險
1. **第三方服務依賴**: 建立服務熔斷與降級機制
2. **資料隱私合規**: 實施資料加密與存取控制
3. **成本控制**: 監控 API 使用量與雲端資源消耗

---

## 🎯 成功指標

### 功能完整性
- [ ] 100% API 端點實現
- [ ] 90% 測試覆蓋率
- [ ] 所有外部整合正常運作

### 性能指標
- [ ] API 回應時間 < 500ms
- [ ] 即時訊息延遲 < 100ms
- [ ] 系統可用性 > 99.9%

### 用戶體驗
- [ ] 完整的端到端工作流
- [ ] 直觀的快速操作
- [ ] 可靠的通知系統

---

此實現計劃涵蓋了協同旅行規劃系統的所有核心功能，確保在有限時間內能夠交付一個功能完整、性能優異的 MVP 產品。每個階段都有明確的交付物和測試標準，便於團隊協作和進度追蹤。
