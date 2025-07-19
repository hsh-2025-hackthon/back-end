import { getRedisClient } from './redis';
import Queue from 'bull';
import { randomBytes } from 'crypto';

interface CommandMessage {
  id: string;
  type: string;
  aggregateId: string;
  data: any;
  timestamp: Date;
  userId: string;
}

interface EventMessage {
  id: string;
  type: string;
  aggregateId: string;
  data: any;
  timestamp: Date;
  version: number;
}

// Bull Queue instances
let commandQueue: Queue.Queue<CommandMessage>;
let eventQueue: Queue.Queue<EventMessage>;

// Handler registration flags
let commandHandlerRegistered = false;
let eventHandlerRegistered = false;

const getCommandQueue = (): Queue.Queue<CommandMessage> => {
  if (!commandQueue) {
    commandQueue = new Queue<CommandMessage>('trip-commands', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });
  }
  return commandQueue;
};

const getEventQueue = (): Queue.Queue<EventMessage> => {
  if (!eventQueue) {
    eventQueue = new Queue<EventMessage>('trip-events', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });
  }
  return eventQueue;
};

// Command handling for CQRS pattern using Bull Queue
export const sendCommand = async (command: CommandMessage): Promise<void> => {
  const queue = getCommandQueue();

  try {
    await queue.add('process-command', command, {
      jobId: command.id,
      delay: 0,
    });
    console.log(`Command ${command.type} queued for aggregate ${command.aggregateId}`);
  } catch (error) {
    console.error('Failed to send command:', error);
    throw error;
  }
};

// Event publishing for event sourcing using Bull Queue and Redis Streams
export const publishEvent = async (event: EventMessage): Promise<void> => {
  const redis = getRedisClient();
  const queue = getEventQueue();

  try {
    // Add to Redis Stream for event sourcing
    await redis.xadd(
      `events:${event.aggregateId}`,
      '*',
      'id', event.id,
      'type', event.type,
      'data', JSON.stringify(event.data),
      'timestamp', event.timestamp.toISOString(),
      'version', event.version.toString()
    );

    // Add to Bull Queue for processing
    await queue.add('process-event', event, {
      jobId: event.id,
      delay: 0,
    });

    console.log(`Event ${event.type} published for aggregate ${event.aggregateId}`);
  } catch (error) {
    console.error('Failed to publish event:', error);
    throw error;
  }
};

// Trip-specific command handlers
export const sendTripCommand = async (
  type: 'CREATE_TRIP' | 'UPDATE_TRIP' | 'DELETE_TRIP' | 'ADD_COLLABORATOR' | 'REMOVE_COLLABORATOR',
  aggregateId: string,
  data: any,
  userId: string
): Promise<void> => {
  const command: CommandMessage = {
    id: generateId(),
    type,
    aggregateId,
    data,
    timestamp: new Date(),
    userId
  };

  await sendCommand(command);
};

// Trip-specific event publishers
export const publishTripEvent = async (
  type: 'TRIP_CREATED' | 'TRIP_UPDATED' | 'TRIP_DELETED' | 'COLLABORATOR_ADDED' | 'COLLABORATOR_REMOVED',
  aggregateId: string,
  data: any,
  version: number
): Promise<void> => {
  const event: EventMessage = {
    id: generateId(),
    type,
    aggregateId,
    data,
    timestamp: new Date(),
    version
  };

  await publishEvent(event);
};

// Command processor for handling incoming commands using Bull Queue
export const processCommands = async (processor: (command: CommandMessage) => Promise<void>): Promise<void> => {
  const queue = getCommandQueue();

  // Check if handler already registered to prevent duplicate registration
  if (commandHandlerRegistered) {
    console.log('Command processor handler already registered, skipping...');
    return;
  }
  commandHandlerRegistered = true;

  queue.process('process-command', async (job) => {
    const command = job.data;
    console.log(`Processing command ${command.type} for aggregate ${command.aggregateId}`);
    
    try {
      await processor(command);
      console.log(`Command ${command.type} processed successfully`);
    } catch (error) {
      console.error('Error processing command:', error);
      throw error; // Bull Queue will handle retries and failed jobs
    }
  });

  queue.on('failed', (job, err) => {
    console.error(`Command job ${job.id} failed:`, err);
  });

  queue.on('error', (error) => {
    console.error('Command queue error:', error);
  });
};

// Event processor for handling published events using Bull Queue
export const processEvents = async (processor: (event: EventMessage) => Promise<void>): Promise<void> => {
  const queue = getEventQueue();

  // Check if handler already registered to prevent duplicate registration
  if (eventHandlerRegistered) {
    console.log('Event processor handler already registered, skipping...');
    return;
  }
  eventHandlerRegistered = true;

  queue.process('process-event', async (job) => {
    const event = job.data;
    console.log(`Processing event ${event.type} for aggregate ${event.aggregateId}`);
    
    try {
      await processor(event);
      console.log(`Event ${event.type} processed successfully`);
    } catch (error) {
      console.error('Error processing event:', error);
      throw error; // Bull Queue will handle retries and failed jobs
    }
  });

  queue.on('failed', (job, err) => {
    console.error(`Event job ${job.id} failed:`, err);
  });

  queue.on('error', (error) => {
    console.error('Event queue error:', error);
  });
};


// Utility function to generate unique IDs
export const generateId = (): string => {
  return `${Date.now()}-${randomBytes(4).toString('hex')}`;
};

// Graceful shutdown
export const closeServiceBusClient = async (): Promise<void> => {
  const promises = [];
  
  if (commandQueue) {
    promises.push(commandQueue.close());
  }
  
  if (eventQueue) {
    promises.push(eventQueue.close());
  }
  
  await Promise.all(promises);
  console.log('All Bull queues closed');
};
