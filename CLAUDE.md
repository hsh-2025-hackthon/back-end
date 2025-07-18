# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands
- `npm run dev` - Start development server with hot reload at http://localhost:3000
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run typecheck` - Run TypeScript compiler checks (use this after making changes)

### Database Commands
- `npm run migrate` - Run database migrations
- `npm run test:connection` - Test all Azure service connections

### Testing Commands
- `npm run test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:unit` - Run unit tests only
- `npm run test:integration` - Run integration tests only
- `npm run test:e2e` - Run end-to-end tests only

Note: No linting is currently configured (`npm run lint` outputs "No linting configured")

## Architecture Overview

This is a **modular monolith** backend for a collaborative travel planning system built with:
- **TypeScript + Express.js** for the API layer
- **CQRS pattern** for complex operations (commands modify state, queries read from optimized models)
- **PostgreSQL** for transactional data (primary database)
- **Azure Cosmos DB** for read-optimized denormalized data
- **Azure services** for authentication, real-time communication, AI, and messaging

### Key Architectural Patterns

1. **Command Query Responsibility Segregation (CQRS)**
   - Commands: Write operations that update PostgreSQL and emit events
   - Queries: Read operations from denormalized Cosmos DB models
   - Event-driven sync keeps read models updated

2. **Dual Database Strategy**
   - PostgreSQL: ACID compliance, transactional integrity
   - Cosmos DB: Low-latency reads, denormalized data

3. **Real-time Collaboration**
   - Azure Web PubSub for WebSocket connections
   - Group-based messaging for trip collaboration
   - Conflict-free replicated data types (CRDTs) on frontend

## Project Structure

```
src/
├── api/
│   ├── middleware/auth.ts      # JWT validation with Azure AD B2C
│   └── routes/                 # API endpoints
│       ├── ai.ts              # AI recommendations & itinerary generation
│       ├── collaboration.ts    # Real-time collaboration features
│       ├── trips.ts           # Trip CRUD operations
│       └── users.ts           # User management
├── config/database.ts         # Database connection configuration
├── features/trips/            # CQRS command/query handlers
│   ├── trip-commands.ts
│   └── trip-queries.ts
├── lib/                       # Azure service integrations
│   ├── cosmos.ts             # Cosmos DB client and operations
│   ├── eventhubs.ts          # Event Hubs for analytics
│   ├── keyvault.ts           # Secret management
│   ├── migrations.ts         # Database migration system
│   ├── openai.ts             # Azure OpenAI integration
│   ├── search.ts             # Cognitive Search for vector search
│   ├── servicebus.ts         # Service Bus messaging
│   └── webpubsub.ts          # Real-time WebSocket features
├── models/                   # Data models and repositories
│   ├── trip.ts              # Trip entity with CRUD operations
│   └── user.ts              # User entity with CRUD operations
└── server.ts                # Main application entry point
```

## Key Components

### Authentication & Security
- Azure AD B2C JWT token validation in `src/api/middleware/auth.ts`
- Row-level security for data isolation
- Azure Key Vault for secrets management
- CORS configuration for cross-origin requests

### Database Layer
- **PostgreSQL**: Primary transactional database with migrations in `src/lib/migrations.ts`
- **Cosmos DB**: Read-optimized models accessed via `src/lib/cosmos.ts`
- Automatic migration running on server startup

### Azure Services Integration
- **Service Bus**: Asynchronous messaging (`src/lib/servicebus.ts`)
- **Event Hubs**: Event streaming for analytics (`src/lib/eventhubs.ts`)
- **Web PubSub**: Real-time collaboration (`src/lib/webpubsub.ts`)
- **OpenAI**: AI-powered recommendations (`src/lib/openai.ts`)
- **Cognitive Search**: Vector search capabilities (`src/lib/search.ts`)

## API Endpoints

### Base URL: `/api`
- Health check: `/health`
- Users: `/api/users` (profile management, search)
- Trips: `/api/trips` (CRUD, collaborators)
- AI: `/api/ai` (itinerary generation, recommendations)
- Collaboration: `/api/collaboration` (real-time features)

## Development Guidelines

### Server Startup
The server automatically:
1. Tests database connection
2. Runs database migrations
3. Starts on port 3000 (configurable via PORT env var)

### Error Handling
- Comprehensive error middleware in `src/server.ts`
- Development mode shows detailed error messages
- Production mode shows sanitized error responses

### Testing
- Jest configuration in `jest.config.js`
- Test files in `tests/` directory
- Coverage threshold set to 70% across all metrics
- Separate test types: unit, integration, e2e

### Environment Variables
Required environment variables are documented in `.env.example` and include:
- Database connection strings
- Azure service endpoints and keys
- Authentication configuration
- Feature flags and settings

## Common Tasks

### Adding New Features
1. Create route handlers in `src/api/routes/`
2. Add models/repositories in `src/models/`
3. Implement CQRS handlers in `src/features/`
4. Add tests in `tests/`

### Database Changes
1. Add migration scripts to `src/lib/migrations.ts`
2. Update models in `src/models/`
3. Run `npm run migrate` to apply changes

### Azure Service Integration
1. Add service client in `src/lib/`
2. Configure connection strings in environment
3. Add service-specific error handling