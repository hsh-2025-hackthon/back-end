import express from 'express';
import { createServer } from 'http';
import { runMigrations } from './lib/migrations';
import { testConnection } from './config/database';
import { tripEventProcessor } from './features/trips/trip-event-processor';
import { mcpManager } from './features/mcp/mcp-manager';
import { serviceHealthManager } from './lib/service-health';
import { CollaborativeWebSocketServer } from './lib/websocket-server';
import { initializeSearchTables } from './lib/search';
import { checkRedisHealth } from './lib/redis';

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3000;

// Initialize WebSocket server
let wsServer: CollaborativeWebSocketServer;

// Import routes
import tripsRouter from './api/routes/trips';
import usersRouter from './api/routes/users';
import collaborationRouter from './api/routes/collaboration';
import aiRouter from './api/routes/ai';
import authRouter from './api/routes/auth';
import chatRouter from './api/routes/chat';
import votesRouter from './api/routes/votes';
import expensesRouter from './api/routes/expenses';
import mcpRouter from './api/routes/mcp';
import notificationsRouter from './api/routes/notifications';
import healthRouter from './api/routes/health';
import quickActionsRouter from './api/routes/quick-actions';
import bookingRouter from './api/routes/booking';
import smartCardsRouter from './api/routes/smart-cards';
import agentsRouter from './api/routes/agents';
import versionsRouter from './api/routes/versions';
import permissionsRouter from './api/routes/permissions';
import visualizationRouter from './api/routes/visualization';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware (adjust origins for production)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const healthChecks = await serviceHealthManager.getServiceHealth() as any[];
    const summary = serviceHealthManager.getHealthSummary();
    
    const overallStatus = summary.unhealthy > 0 ? 'degraded' : 
                         summary.unknown > 0 ? 'unknown' : 'healthy';
    
    res.status(overallStatus === 'healthy' ? 200 : 503).json({ 
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      summary,
      services: healthChecks
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      message: 'Health check failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Detailed health check endpoint for each service category
app.get('/health/services', async (req, res) => {
  try {
    const healthChecks = await serviceHealthManager.getServiceHealth() as any[];
    res.json({
      timestamp: new Date().toISOString(),
      services: healthChecks
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get service health',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// MCP-specific health check endpoint
app.get('/health/mcp', async (req, res) => {
  try {
    const mcpHealth = await mcpManager.getServiceHealth();
    const availableServices = mcpManager.getAvailableServices();
    
    res.json({
      timestamp: new Date().toISOString(),
      availableServices,
      health: mcpHealth
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get MCP health',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/users', usersRouter);
app.use('/api/collaboration', collaborationRouter);
app.use('/api/ai', aiRouter);
app.use('/api', chatRouter);
app.use('/api', votesRouter);
app.use('/api', expensesRouter);
app.use('/api/mcp', mcpRouter);
app.use('/api', notificationsRouter);
app.use('/api/trips', quickActionsRouter);
app.use('/api/trips', smartCardsRouter);
app.use('/api/booking', bookingRouter);
app.use('/api', agentsRouter);
app.use('/api', versionsRouter);  // Version control endpoints
app.use('/api', permissionsRouter);  // Permission management endpoints
app.use('/api', visualizationRouter);  // Visualization data endpoints
app.use('/health', healthRouter);


// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Initialize server
async function startServer() {
  try {
    console.log('Starting server initialization...');
    
    // Test database connection
    console.log('Testing database connection...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.warn('Database connection failed - server will start but database features may not work');
    }

    // Test Redis connection
    console.log('Testing Redis connection...');
    const redisHealth = await checkRedisHealth();
    if (redisHealth.status === 'unhealthy') {
      console.warn('Redis connection failed - real-time features may not work');
    } else {
      console.log(`Redis connected successfully (${redisHealth.latency}ms)`);
    }
    
    // Run database migrations
    if (dbConnected) {
      try {
        console.log('Running database migrations...');
        await runMigrations();
        console.log('Database migrations completed');
        
        // Initialize search tables with pgvector
        console.log('Initializing search tables...');
        await initializeSearchTables();
        console.log('Search tables initialized');
      } catch (error) {
        console.error('Migration or search initialization failed:', error);
        console.warn('Server will start but database may not be properly initialized');
      }
    }

    // Check third-party services health
    console.log('Checking third-party services...');
    try {
      const serviceHealth = await serviceHealthManager.checkAllServices();
      const summary = serviceHealthManager.getHealthSummary();
      
      console.log(`\n🔍 Service Health Summary:`);
      console.log(`   Total: ${summary.total} | Healthy: ${summary.healthy} | Unhealthy: ${summary.unhealthy} | Unknown: ${summary.unknown}`);
      
      serviceHealth.forEach(service => {
        const statusIcon = service.status === 'healthy' ? '✅' : 
                          service.status === 'unhealthy' ? '❌' : '❓';
        const responseTime = service.responseTime ? ` (${service.responseTime}ms)` : '';
        console.log(`   ${statusIcon} ${service.service}${responseTime}`);
        if (service.message && service.status !== 'healthy') {
          console.log(`      └─ ${service.message}`);
        }
      });
      
      if (summary.unhealthy > 0) {
        console.warn(`\n⚠️  ${summary.unhealthy} service(s) are unhealthy - some features may not work properly`);
      }
      
    } catch (error) {
      console.error('Failed to check third-party services:', error);
      console.warn('Server will start but some external features may not work');
    }

    // Start event processor for CQRS read model synchronization
    try {
      console.log('\nStarting event processor...');
      await tripEventProcessor.start();
      console.log('Event processor started');
    } catch (error) {
      console.error('Event processor failed to start:', error);
      console.warn('Server will start but CQRS events may not be processed');
    }

    // Initialize WebSocket server
    if (redisHealth.status === 'healthy') {
      try {
        console.log('Initializing WebSocket server...');
        wsServer = new CollaborativeWebSocketServer(server);
        console.log('WebSocket server initialized');
      } catch (error) {
        console.error('WebSocket server failed to start:', error);
        console.warn('Server will start but real-time collaboration may not work');
      }
    }
    
    // Start server
    server.listen(port, () => {
      console.log(`\n🚀 Server is running on port ${port}`);
      console.log(`📚 Health check: http://localhost:${port}/health`);
      console.log(`🔍 Service health: http://localhost:${port}/health/services`);
      console.log(`🔧 MCP health: http://localhost:${port}/health/mcp`);
      console.log(`🔧 API endpoints: http://localhost:${port}/api/`);
      console.log(`🔌 WebSocket endpoint: ws://localhost:${port}/ws`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('\n📝 Development mode - Additional info:');
        console.log(`   Environment: ${process.env.NODE_ENV}`);
        console.log(`   Database connected: ${dbConnected ? '✅' : '❌'}`);
        console.log(`   Redis connected: ${redisHealth.status === 'healthy' ? '✅' : '❌'}`);
        console.log(`   WebSocket server: ${wsServer ? '✅' : '❌'}`);
      }
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await tripEventProcessor.stop();
  if (wsServer) {
    await wsServer.close();
  }
  mcpManager.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await tripEventProcessor.stop();
  if (wsServer) {
    await wsServer.close();
  }
  mcpManager.shutdown();
  process.exit(0);
});

// Start the server
startServer();
