# Backend Implementation Guide

This guide outlines the implementation plan for the backend of the Collaborative Travel Planning AI System. It is designed for an AI agent to follow.

## 1. Core Technology Stack

- **Runtime:** Node.js with TypeScript.
- **Framework:** A modular monolith approach. An Express.js or Fastify server will handle core API functionalities. Specific, computationally intensive tasks will be delegated to serverless functions or containerized microservices.
- **Primary Database:** [Azure Database for PostgreSQL](https://azure.microsoft.com/en-us/services/postgresql/) for transactional data (users, bookings).
- **Read-Optimized Database:** [Azure Cosmos DB](https://azure.microsoft.com/en-us/services/cosmos-db/) (using the MongoDB API) for read-heavy data like trip itineraries.
- **Real-time Messaging:** [Azure Web PubSub](https://azure.microsoft.com/en-us/services/web-pubsub/) for WebSocket-based real-time communication.
- **Asynchronous Tasks & Events:** [Azure Service Bus](https://azure.microsoft.com/en-us/services/service-bus/) for reliable messaging and [Azure Event Hubs](https://azure.microsoft.com/en-us/services/event-hubs/) for high-throughput event streaming (e.g., analytics).
- **AI/ML:** [Azure OpenAI Service](https://azure.microsoft.com/en-us/services/openai-service/) for LLM-powered features and [Azure Cognitive Search](https://azure.microsoft.com/en-us/services/cognitive-search/) for vector search.
- **API Gateway:** [Azure API Management](https://azure.microsoft.com/en-us/services/api-management/) to secure and manage APIs.
- **Secrets Management:** [Azure Key Vault](https://azure.microsoft.com/en-us/services/key-vault/).

## 2. Project Setup

1.  **Initialize Node.js Project:**
    ```bash
    npm init -y
    npm install typescript ts-node @types/node --save-dev
    npx tsc --init # Configure tsconfig.json
    ```
2.  **Install Dependencies:**
    ```bash
    npm install express @azure/web-pubsub @azure/service-bus @azure/event-hubs @azure/cosmos @azure/identity @azure/keyvault-secrets pg
    ```

## 3. Architecture

A modular monolith will serve as the core. Microservices will be used for:
-   **AI Recommendation Engine:** A Python service running in an Azure Container App with GPU support.
-   **Real-time Collaboration Service:** An Azure Function or a small Node.js service to manage Web PubSub connections.
-   **File Processing:** Azure Functions triggered by Azure Blob Storage events.

### Directory Structure (Monolith)

```
/
├── src/
│   ├── api/          # API routes and controllers
│   ├── config/       # Application configuration
│   ├── core/         # Core business logic and services
│   ├── features/     # Feature-specific modules (e.g., trips, users)
│   ├── lib/          # Shared libraries (e.g., database client, logger)
│   ├── models/       # Data models and schemas
│   └── server.ts     # Server entry point
├── test/
└── package.json
```

## 4. Implementation Steps

### Step 1: Database Setup

-   **PostgreSQL:**
    -   Provision an Azure Database for PostgreSQL instance.
    -   Define the schema for users, trips, bookings, etc. Use migrations to manage schema changes.
    -   Implement Row-Level Security (RLS) to enforce data isolation between users.
-   **Cosmos DB:**
    -   Provision an Azure Cosmos DB account with the MongoDB API.
    -   Data from PostgreSQL will be denormalized and synced to Cosmos DB for fast reads. Use Azure Functions triggered by the PostgreSQL change feed (e.g., using Debezium) or an event-based mechanism to keep them in sync.

### Step 2: API Development

-   **Authentication:** Implement middleware to validate JWTs issued by Azure AD B2C. The validation should be done by fetching the public keys from the B2C tenant.
-   **CRUD Operations:** Develop standard CRUD endpoints for managing trips, users, and other resources.
-   **CQRS Pattern:** For complex operations like trip planning, separate the read and write paths.
    -   **Commands:** Write operations (e.g., `addDestinationToTrip`) will be handled as commands, which update the primary PostgreSQL database and emit events.
    -   **Queries:** Read operations will fetch data from the optimized Cosmos DB read models.

### Step 3: Real-time Service with Azure Web PubSub

-   Create a service (e.g., an Azure Function with a Web PubSub trigger) to handle WebSocket connections.
-   This service will:
    -   Authenticate users connecting to the WebSocket.
    -   Manage user presence in groups (each trip is a group).
    -   Receive messages from clients (forwarded by the Y.js provider) and broadcast them to the appropriate group.

**Reference Code (`PLAN.md`):**
```javascript
// Example Azure Function for Web PubSub
const { WebPubSubServiceClient } = require('@azure/web-pubsub');

module.exports = async function (context, req) {
    const serviceClient = new WebPubSubServiceClient(process.env.WebPubSubConnectionString, 'collaborationHub');
    const token = await serviceClient.getClientAccessToken({
        userId: req.headers['x-ms-client-principal-name'], // Get user from App Service Auth
        roles: [`webpubsub.sendToGroup.${req.query.tripId}`]
    });
    context.res = { body: token };
};
```

### Step 4: AI/ML Integration

-   **Azure OpenAI Service:**
    -   Create a dedicated service, likely in Python, to interact with Azure OpenAI.
    -   Implement functions for generating itineraries, providing recommendations, etc.
    -   Use structured prompts for reliable JSON output.
    -   Cache expensive AI responses in Azure Redis Cache.
-   **Azure Cognitive Search:**
    -   Set up an index in Cognitive Search with vector fields.
    -   Create a pipeline to generate embeddings (using Azure OpenAI) for travel destinations, activities, etc., and store them in the search index.
    -   Implement a search service that performs hybrid (vector + text) searches.

### Step 5: Event-Driven Architecture

-   Use **Azure Service Bus** for critical, command-based messages (e.g., `ProcessBooking`).
-   Use **Azure Event Hubs** to stream events for analytics and to feed into other systems (e.g., a real-time dashboard or a data warehouse).

## 5. Security

-   **Secrets:** All secrets (connection strings, API keys) must be stored in **Azure Key Vault**. The application should use Managed Identity to authenticate to Key Vault.
-   **API Protection:** All public-facing endpoints must be routed through **Azure API Management**. Configure policies for authentication, rate limiting, and CORS.

