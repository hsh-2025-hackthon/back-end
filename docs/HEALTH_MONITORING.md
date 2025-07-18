# Service Health Monitoring

This document describes the comprehensive service health monitoring system implemented in the travel planning backend.

## Overview

The server now performs health checks for all third-party services during startup and provides multiple health check endpoints for monitoring service status in real-time.

## Startup Health Checks

During server initialization, the system checks:

### Database Services
- **PostgreSQL Database** - Connection and migration status

### Azure Services
- **Azure OpenAI** - AI completion service availability
- **Cosmos DB** - Document database connectivity
- **Event Hubs** - Event streaming service
- **Azure Search** - Search index service
- **Web PubSub** - Real-time communication service
- **Azure Maps** - Location and mapping services

### MCP (Model Context Protocol) Services
- **Weather MCP** - OpenWeather API integration
- **Maps MCP** - Additional Azure Maps integration
- **Exchange Rate MCP** - Currency conversion service
- **Travel Info MCP** - TripAdvisor API integration

## Health Check Endpoints

### 1. Main Health Check
```
GET /health
```

Returns overall system health with summary and all service statuses.

**Response:**
```json
{
  "status": "healthy|degraded|unknown|error",
  "timestamp": "2025-07-19T12:00:00.000Z",
  "version": "1.0.0",
  "summary": {
    "total": 10,
    "healthy": 8,
    "unhealthy": 2,
    "unknown": 0
  },
  "services": [...]
}
```

### 2. Detailed Service Health
```
GET /health/services
```

Returns detailed health information for all services.

### 3. Individual Service Health
```
GET /health/services/:serviceName
```

Get health status for a specific service (e.g., "Azure OpenAI", "MCP weather").

### 4. Azure Services Health
```
GET /health/azure
```

Returns health status for all Azure-specific services.

### 5. MCP Services Health
```
GET /health/mcp
```

Returns health status for all MCP services.

### 6. Manual Health Refresh
```
POST /health/refresh
```

Force refresh all health checks (bypasses 30-second cache).

## Service Status Indicators

- **✅ Healthy** - Service is operational and responding correctly
- **❌ Unhealthy** - Service is down or returning errors
- **❓ Unknown** - Service status could not be determined

## Configuration

Services are configured via environment variables:

### Azure Services
```bash
# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-openai.openai.azure.com/
AZURE_OPENAI_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4

# Cosmos DB
COSMOS_DB_ENDPOINT=https://your-cosmosdb.documents.azure.com:443/
COSMOS_DB_KEY=your-cosmos-key
COSMOS_DB_DATABASE_ID=travel-planning
COSMOS_DB_CONTAINER_ID=trip-itineraries

# Event Hubs
AZURE_EVENTHUBS_CONNECTION_STRING=your-connection-string
AZURE_EVENTHUB_NAME=travel-events

# Azure Search
AZURE_SEARCH_ENDPOINT=https://your-search.search.windows.net
AZURE_SEARCH_ADMIN_KEY=your-search-key
AZURE_SEARCH_INDEX=travel-index

# Web PubSub
AZURE_WEBPUBSUB_CONNECTION_STRING=your-connection-string
AZURE_WEBPUBSUB_HUB_NAME=travel-hub

# Azure Maps
AZURE_MAPS_API_KEY=your-maps-key
AZURE_MAPS_CLIENT_ID=your-client-id
```

### MCP Services
```bash
# Weather Service
OPENWEATHER_API_KEY=your-openweather-key

# Maps Service (additional)
AZURE_MAPS_KEY=your-maps-key

# Exchange Rate Service
EXCHANGE_RATE_API_KEY=your-exchange-rate-key

# Travel Info Service
TRAVEL_INFO_API_KEY=your-tripadvisor-key
```

## Caching

Health check results are cached for 30 seconds to prevent excessive API calls. Use the `/health/refresh` endpoint to force immediate updates.

## Monitoring Integration

The health endpoints can be integrated with monitoring tools:

- **Uptime monitoring** - Use `GET /health` for overall status
- **Service-specific alerts** - Use individual service endpoints
- **Dashboards** - Consume the JSON responses for custom dashboards
- **Load balancers** - Configure health checks on `/health`

## Startup Behavior

The server will:
1. ✅ Always start regardless of service health
2. 📊 Display comprehensive health summary in console
3. ⚠️ Show warnings for unhealthy services
4. 🚀 Continue with degraded functionality if some services are down

## Example Startup Output

```
Starting server initialization...
Testing database connection...
Running database migrations...
Database migrations completed

🔍 Service Health Summary:
   Total: 10 | Healthy: 8 | Unhealthy: 2 | Unknown: 0
   ✅ Azure OpenAI (245ms)
   ✅ Cosmos DB (156ms)
   ❌ Event Hubs
      └─ Missing AZURE_EVENTHUBS_CONNECTION_STRING
   ✅ Azure Search (198ms)
   ❌ Web PubSub
      └─ Missing AZURE_WEBPUBSUB_CONNECTION_STRING
   ✅ Azure Maps (89ms)
   ✅ MCP weather (312ms)
   ✅ MCP maps (278ms)
   ✅ MCP exchangeRate (445ms)
   ✅ MCP travelInfo (523ms)

⚠️  2 service(s) are unhealthy - some features may not work properly

Starting event processor...
Event processor started

🚀 Server is running on port 3000
📚 Health check: http://localhost:3000/health
🔍 Service health: http://localhost:3000/health/services
🔧 MCP health: http://localhost:3000/health/mcp
🔧 API endpoints: http://localhost:3000/api/
```
