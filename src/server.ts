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
import chatRouter from './api/routes/chat';
import votesRouter from './api/routes/votes';

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
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/users', usersRouter);
app.use('/api/collaboration', collaborationRouter);
app.use('/api/ai', aiRouter);
app.use('/api', chatRouter);
app.use('/api', votesRouter);


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
    
    // Run database migrations
    if (dbConnected) {
      try {
        console.log('Running database migrations...');
        await runMigrations();
        console.log('Database migrations completed');
      } catch (error) {
        console.error('Migration failed:', error);
        console.warn('Server will start but database may not be properly initialized');
      }
    }

    // Start event processor for CQRS read model synchronization
    try {
      console.log('Starting event processor...');
      await tripEventProcessor.start();
      console.log('Event processor started');
    } catch (error) {
      console.error('Event processor failed to start:', error);
      console.warn('Server will start but CQRS events may not be processed');
    }
    
    // Start server
    app.listen(port, () => {
      console.log(`🚀 Server is running on port ${port}`);
      console.log(`📚 Health check: http://localhost:${port}/health`);
      console.log(`🔧 API endpoints: http://localhost:${port}/api/`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('\n📝 Development mode - Additional info:');
        console.log(`   Environment: ${process.env.NODE_ENV}`);
        console.log(`   Database connected: ${dbConnected ? '✅' : '❌'}`);
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
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await tripEventProcessor.stop();
  process.exit(0);
});

// Start the server
startServer();
