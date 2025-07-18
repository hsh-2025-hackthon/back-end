# Travel Planning Backend

A comprehensive backend implementation for the Collaborative Travel Planning AI System, built with Node.js, TypeScript, and Azure services.

## 🏗️ Architecture

This backend follows a **modular monolith** approach with microservices for specific features:

- **Core API**: Express.js server with TypeScript
- **Database Layer**: PostgreSQL for transactional data, Cosmos DB for read-optimized data
- **Authentication**: Azure AD B2C with JWT validation
- **Real-time Communication**: Azure Web PubSub for collaboration
- **Event-Driven**: Azure Service Bus for commands, Event Hubs for analytics
- **AI Integration**: Azure OpenAI for recommendations and itinerary generation
- **Search**: Azure Cognitive Search for vector-based destination search
- **Security**: Azure Key Vault for secrets management

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm/pnpm
- PostgreSQL database
- Azure account with required services

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd back-end
   npm install
   ```

2. **Environment setup:**
   ```bash
   cp .env.example .env
   # Edit .env with your Azure service connection strings
   ```

3. **Database setup:**
   ```bash
   # Test all connections
   npm run test:connection
   
   # Run database migrations
   npm run migrate
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3000` with automatic database initialization.

## 🛠️ Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run migrate` - Run database migrations
- `npm run test:connection` - Test all Azure service connections

## 📚 API Documentation

### Base URL
- Development: `http://localhost:3000/api`
- Health Check: `http://localhost:3000/health`

### Authentication
All protected endpoints require a Bearer token from Azure AD B2C:
```
Authorization: Bearer <jwt_token>
```

### Core Endpoints

#### Users (`/api/users`)
- `GET /me` - Get current user profile
- `PUT /me` - Update current user profile
- `GET /:id` - Get user by ID (public profile)
- `GET /` - Search users (for collaboration)
- `DELETE /me` - Delete current user account

#### Trips (`/api/trips`)
- `GET /` - Get user's trips
- `GET /:id` - Get trip details
- `POST /` - Create new trip
- `PUT /:id` - Update trip
- `DELETE /:id` - Delete trip
- `POST /:id/collaborators` - Add collaborator
- `GET /:id/collaborators` - Get trip collaborators
- `DELETE /:id/collaborators/:userId` - Remove collaborator

#### AI Recommendations (`/api/ai`)
- `POST /itinerary` - Generate AI-powered itinerary
- `POST /recommendations` - Get category-specific recommendations
- `POST /enhance-trip/:tripId` - Enhance existing trip with AI suggestions

#### Collaboration (`/api/collaboration`)
- `GET /token/:tripId` - Get Web PubSub access token
- `POST /join/:tripId` - Join collaboration session
- `POST /leave/:tripId` - Leave collaboration session
- `GET /status/:tripId` - Get collaboration status

## 🗄️ Database Schema

### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    azure_ad_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Trips Table
```sql
CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    destination JSONB,
    budget DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    status trip_status DEFAULT 'planning',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Trip Collaborators Table
```sql
CREATE TABLE trip_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id),
    user_id UUID NOT NULL REFERENCES users(id),
    role collaboration_role DEFAULT 'viewer',
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(trip_id, user_id)
);
```

## 🔧 Configuration

### Required Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=development

# Database
POSTGRES_HOST=localhost
POSTGRES_DB=travel_planning
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password

# Azure Services
AZURE_AD_B2C_TENANT_ID=your-tenant
AZURE_AD_B2C_CLIENT_ID=your-client-id
AZURE_KEYVAULT_URL=https://your-vault.vault.azure.net/
COSMOS_DB_ENDPOINT=https://your-cosmos.documents.azure.com/
AZURE_OPENAI_ENDPOINT=https://your-openai.openai.azure.com/
# ... see .env.example for complete list
```

### Azure Services Setup

1. **Azure AD B2C**: Configure tenant and application registration
2. **PostgreSQL**: Azure Database for PostgreSQL or local instance
3. **Cosmos DB**: MongoDB API with partition key `/tripId`
4. **Key Vault**: Store connection strings and API keys
5. **Service Bus**: Create `trip-commands` and `trip-events` queues
6. **Web PubSub**: Configure `collaborationHub` hub
7. **OpenAI**: Deploy GPT-4 model for AI features

## 🏗️ Project Structure

```
src/
├── api/
│   ├── middleware/
│   │   └── auth.ts          # JWT validation middleware
│   └── routes/
│       ├── ai.ts            # AI recommendation endpoints
│       ├── collaboration.ts # Real-time collaboration
│       ├── trips.ts         # Trip management
│       └── users.ts         # User management
├── config/
│   └── database.ts          # Database connection config
├── features/
│   └── trips/               # CQRS command/query handlers
├── lib/
│   ├── cosmos.ts            # Cosmos DB client and operations
│   ├── eventhubs.ts         # Event Hubs integration
│   ├── keyvault.ts          # Key Vault secret management
│   ├── migrations.ts        # Database migration system
│   ├── openai.ts            # Azure OpenAI integration
│   ├── search.ts            # Cognitive Search integration
│   ├── servicebus.ts        # Service Bus messaging
│   └── webpubsub.ts         # Web PubSub real-time features
├── models/
│   ├── trip.ts              # Trip entity and repository
│   └── user.ts              # User entity and repository
└── server.ts                # Main application entry point
```

## 🔒 Security Features

- **JWT Authentication** with Azure AD B2C
- **Row-Level Security** for data isolation
- **API Rate Limiting** via Azure API Management
- **Secret Management** with Azure Key Vault
- **CORS Configuration** for cross-origin requests
- **Input Validation** and sanitization
- **Error Handling** with secure error messages

## 🚀 Deployment

### Azure Container Apps (Recommended)
```yaml
# azure-container-app.yml
apiVersion: v1
kind: ConfigMap
metadata:
  name: backend-config
data:
  NODE_ENV: "production"
  PORT: "3000"
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
```

## 🔍 Monitoring & Observability

- **Health Checks**: `/health` endpoint for service monitoring
- **Structured Logging**: JSON formatted logs for Azure Monitor
- **Error Tracking**: Comprehensive error handling and reporting
- **Performance Metrics**: Integration with Azure Application Insights

## 📝 Development Notes

### CQRS Pattern
- **Commands**: Write operations that modify state
- **Queries**: Read operations from optimized read models
- **Events**: Published to Service Bus for downstream processing

### Data Sync
- PostgreSQL serves as the primary data store
- Cosmos DB contains denormalized read models
- Event-driven sync keeps read models updated

### Real-time Features
- Web PubSub manages WebSocket connections
- Group-based messaging for trip collaboration
- Presence tracking for active collaborators

---

# Original System Overview

This is a comprehensive, AI-powered travel planning system designed for real-time collaboration. It leverages a sophisticated architecture with Azure integration to provide a seamless and intelligent travel planning experience.

## Tech Stack

The project is built on a modern, scalable, and secure technology stack, primarily leveraging the Microsoft Azure ecosystem.

- **Frontend:** Next.js with React, Jotai for state management, and Yjs for real-time collaboration.
- **Backend:** A modular monolith using Node.js with TypeScript and Express.js, with specific microservices for intensive tasks.
- **Databases:**
    -   **Primary:** Azure Database for PostgreSQL for transactional data.
    -   **Read-Optimized:** Azure Cosmos DB (MongoDB API) for fast read access to denormalized data.
- **Real-time Communication:** Azure Web PubSub for WebSocket-based communication.
- **Asynchronous Operations:** Azure Service Bus and Azure Event Hubs.
- **AI/ML:** Azure OpenAI Service (GPT-4) and Azure Cognitive Search for vector search.
- **API Management:** Azure API Management.
- **Security:** Azure Key Vault and Azure AD B2C.
- **Deployment:** Azure Static Web Apps, Azure Container Apps, and Azure Kubernetes Service (AKS).
- **Monitoring:** Azure Monitor and Application Insights.
- **CDN:** Azure CDN.

## Deployment

The project is designed for a phased deployment on Microsoft Azure:

1.  **Phase 1: Foundation (Months 1-3):**
    *   Deploy the Next.js frontend to Azure Static Web Apps.
    *   Containerize the monolith and deploy to Azure Container Apps.
    *   Migrate the database to Azure Database for PostgreSQL.
    *   Implement user authentication with Azure AD B2C.
    *   Set up Azure Key Vault for secrets management.
    *   Establish CI/CD pipelines using Azure DevOps.

2.  **Phase 2: Real-time Collaboration (Months 4-6):**
    *   Integrate Azure Web PubSub for real-time features.
    *   Implement CRDTs with Yjs.
    *   Deploy Azure Service Bus for messaging.
    *   Configure Azure Cache for Redis.
    *   Set up Application Insights for monitoring.
    *   Secure APIs with Azure API Management.

3.  **Phase 3: AI and Advanced Features (Months 7-9):**
    *   Implement vector search with Azure Cognitive Search.
    *   Deploy Azure OpenAI Service for AI features.
    *   Use Azure Cosmos DB for read models.
    *   Set up Azure Event Hubs for event streaming.
    *   Create serverless Azure Functions for asynchronous tasks.
    *   Configure Azure CDN for content delivery.

4.  **Phase 4: Scale and Optimize (Months 10-12):**
    *   Migrate to Azure Kubernetes Service (AKS) for orchestration.
    *   Configure Horizontal Pod Autoscaler (HPA).
    *   Set up Azure Front Door for global distribution.
    *   Use Azure Load Testing for performance testing.
    *   Implement cost management with Azure Cost Management.

## Backend Implementation

The backend is a modular monolith built with Node.js and TypeScript. It follows a CQRS pattern for complex operations.

-   **Commands:** Write operations are handled as commands that update the primary PostgreSQL database and emit events.
-   **Queries:** Read operations fetch data from the denormalized, read-optimized Azure Cosmos DB.

Microservices are used for:
-   **AI Recommendation Engine:** A Python service in an Azure Container App.
-   **Real-time Collaboration Service:** An Azure Function or a small Node.js service to manage Web PubSub connections.
-   **File Processing:** Azure Functions triggered by Azure Blob Storage events.

## API Design

The API is designed using a modular approach, with a focus on security and scalability.

-   **API Gateway:** Azure API Management is used as the API gateway, providing a unified entry point for all clients. It enforces policies for:
    -   Authentication and authorization
    -   Rate limiting
    -   CORS
-   **Authentication:** JWTs issued by Azure AD B2C are used to authenticate API requests.
-   **WebSockets:** Real-time communication is handled through Azure Web PubSub, with a dedicated service for managing connections and broadcasting messages.

## Database Design

The database architecture is designed for both transactional integrity and read scalability.

-   **Azure Database for PostgreSQL:** The primary database for all transactional data, ensuring ACID compliance. It is used for user accounts, bookings, and other critical data. Row-Level Security (RLS) is implemented to enforce data isolation.
-   **Azure Cosmos DB:** Used for read-optimized models. Data from PostgreSQL is denormalized and synced to Cosmos DB to provide low-latency read access for features like trip itineraries.
-   **Versioning:** The Azure Cosmos DB Change Feed is used to implement a versioning system for documents, enabling features like audit trails and collaborative history.

## Real-Time Collaboration

Real-time collaboration is a core feature of the system, enabling multiple users to plan trips together simultaneously.

-   **Conflict-free Replicated Data Types (CRDTs):** The frontend uses Yjs, a CRDT implementation, to handle concurrent edits without conflicts.
-   **Signaling Server:** Azure Web PubSub acts as the signaling server, broadcasting changes to all connected clients in a trip planning session.
-   **State Management:** Jotai is used for atomic state management on the frontend, ensuring efficient and conflict-free updates.

## AI/ML Pipeline

The AI/ML pipeline provides intelligent features for travel planning.

-   **Vector Database:** Azure Cognitive Search is used as a vector database, with capabilities for semantic and hybrid search.
-   **LLM Integration:** Azure OpenAI Service provides access to large language models like GPT-4 for generating itineraries, offering recommendations, and more.
-   **Agent Orchestration:** The system is designed to use the Azure AI Agent Service for orchestrating multi-agent scenarios, such as a "planner agent" and a "budget agent" collaborating to create the perfect trip.
-   **Prompt Engineering:** Structured prompts are used to ensure consistent and high-quality outputs from the language models.

## Security

Security is a top priority, with a multi-layered approach to protect user data.

-   **Authentication:** Azure AD B2C provides a comprehensive identity management solution with support for multi-factor authentication and social identity providers.
-   **API Key Management:** Azure Key Vault is used to securely store and manage all API keys, secrets, and connection strings. Managed identities are used to access the vault, eliminating the need for hardcoded credentials.
-   **Data Encryption:**
    -   **At Rest:** Azure Storage Service Encryption is used to automatically encrypt all data.
    -   **In Transit:** Azure Application Gateway with SSL/TLS termination secures all data in transit.

## Scalability

The system is designed to scale horizontally to handle a growing number of users and increasing load.

-   **Caching:** A multi-layer caching strategy is implemented using Azure Cache for Redis for data caching and Azure CDN for static content delivery.
-   **Horizontal Scaling:** The backend is designed to be deployed on Azure Kubernetes Service (AKS), with autoscaling configured based on metrics from Azure Monitor. This allows the system to automatically adjust the number of running instances to meet demand.

## DevOps

A robust DevOps process is in place to ensure continuous integration, delivery, and monitoring.

-   **CI/CD Pipeline:** Azure DevOps is used to create a full CI/CD pipeline, including automated builds, testing, security scanning, and deployment.
-   **Monitoring:** Azure Monitor and Application Insights provide comprehensive monitoring of the entire system, with custom dashboards and alerts for key metrics.

## Third-Party Integrations

The system integrates with third-party services to provide a rich user experience.

-   **Google Maps:** The Google Maps JavaScript API is used for mapping and location-based services, with Azure-specific resilience patterns to handle potential failures.
-   **Multi-Provider API Resilience:** For services like flight and hotel searches, the system is designed to work with multiple providers, with built-in failover and health-checking mechanisms.
