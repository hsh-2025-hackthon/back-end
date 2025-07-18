import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let client: Redis;
let publisherClient: Redis;
let subscriberClient: Redis;

export const getRedisClient = (): Redis => {
  if (!client) {
    client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    
    client.on('error', (error) => {
      console.error('Redis client error:', error);
    });

    client.on('connect', () => {
      console.log('Redis client connected');
    });
  }
  return client;
};

export const getRedisPublisher = (): Redis => {
  if (!publisherClient) {
    publisherClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    
    publisherClient.on('error', (error) => {
      console.error('Redis publisher error:', error);
    });
  }
  return publisherClient;
};

export const getRedisSubscriber = (): Redis => {
  if (!subscriberClient) {
    subscriberClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    
    subscriberClient.on('error', (error) => {
      console.error('Redis subscriber error:', error);
    });
  }
  return subscriberClient;
};

// Health check function
export const checkRedisHealth = async (): Promise<{ status: string; latency?: number }> => {
  try {
    const start = Date.now();
    await getRedisClient().ping();
    const latency = Date.now() - start;
    return { status: 'healthy', latency };
  } catch (error) {
    console.error('Redis health check failed:', error);
    return { status: 'unhealthy' };
  }
};

// Graceful shutdown
export const closeRedisConnections = async (): Promise<void> => {
  const promises = [];
  
  if (client) {
    promises.push(client.quit());
  }
  
  if (publisherClient) {
    promises.push(publisherClient.quit());
  }
  
  if (subscriberClient) {
    promises.push(subscriberClient.quit());
  }
  
  await Promise.all(promises);
  console.log('All Redis connections closed');
};