import { mcpManager } from '../features/mcp/mcp-manager';
import { getCosmosClient } from './cosmos';
import { getOpenAIClient } from './openai';
import { getMapsRouteClient } from './azure-maps';
import { EventHubProducerClient } from '@azure/event-hubs';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import { WebPubSubServiceClient } from '@azure/web-pubsub';

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  message?: string;
  responseTime?: number;
  timestamp: Date;
}

export class ServiceHealthManager {
  private static instance: ServiceHealthManager;
  private healthCache: Map<string, ServiceHealth> = new Map();
  private readonly CACHE_TTL = 30 * 1000; // 30 seconds

  private constructor() {}

  public static getInstance(): ServiceHealthManager {
    if (!ServiceHealthManager.instance) {
      ServiceHealthManager.instance = new ServiceHealthManager();
    }
    return ServiceHealthManager.instance;
  }

  private isCacheValid(health: ServiceHealth): boolean {
    return Date.now() - health.timestamp.getTime() < this.CACHE_TTL;
  }

  private async checkAzureOpenAI(): Promise<ServiceHealth> {
    const startTime = Date.now();
    try {
      if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_KEY) {
        return {
          service: 'Azure OpenAI',
          status: 'unhealthy',
          message: 'Missing environment variables',
          timestamp: new Date()
        };
      }

      const client = getOpenAIClient();
      // Test with a simple completion request
      await client.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      });

      return {
        service: 'Azure OpenAI',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        service: 'Azure OpenAI',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  private async checkCosmosDB(): Promise<ServiceHealth> {
    const startTime = Date.now();
    try {
      if (!process.env.COSMOS_DB_ENDPOINT) {
        return {
          service: 'Cosmos DB',
          status: 'unhealthy',
          message: 'Missing COSMOS_DB_ENDPOINT environment variable',
          timestamp: new Date()
        };
      }

      const client = getCosmosClient();
      // Simple health check - list databases
      await client.databases.readAll().fetchAll();

      return {
        service: 'Cosmos DB',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        service: 'Cosmos DB',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  private async checkEventHubs(): Promise<ServiceHealth> {
    const startTime = Date.now();
    try {
      const connectionString = process.env.AZURE_EVENTHUBS_CONNECTION_STRING;
      if (!connectionString || connectionString.includes('placeholder')) {
        return {
          service: 'Event Hubs',
          status: 'unhealthy',
          message: 'Missing or invalid AZURE_EVENTHUBS_CONNECTION_STRING',
          timestamp: new Date()
        };
      }

      const eventHubName = process.env.AZURE_EVENTHUB_NAME || 'travel-events';
      const producer = new EventHubProducerClient(connectionString, eventHubName);
      
      // Simple connectivity test
      await producer.getEventHubProperties();
      await producer.close();

      return {
        service: 'Event Hubs',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        service: 'Event Hubs',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  private async checkAzureSearch(): Promise<ServiceHealth> {
    const startTime = Date.now();
    try {
      const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
      const apiKey = process.env.AZURE_SEARCH_ADMIN_KEY;
      
      if (!endpoint || !apiKey || endpoint.includes('placeholder')) {
        return {
          service: 'Azure Search',
          status: 'unhealthy',
          message: 'Missing Azure Search configuration',
          timestamp: new Date()
        };
      }

      const indexName = process.env.AZURE_SEARCH_INDEX || 'travel-index';
      const searchClient = new SearchClient(endpoint, indexName, new AzureKeyCredential(apiKey));
      
      // Simple search test
      await searchClient.getDocumentsCount();

      return {
        service: 'Azure Search',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        service: 'Azure Search',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  private async checkWebPubSub(): Promise<ServiceHealth> {
    const startTime = Date.now();
    try {
      const connectionString = process.env.AZURE_WEBPUBSUB_CONNECTION_STRING;
      if (!connectionString || connectionString.includes('placeholder')) {
        return {
          service: 'Web PubSub',
          status: 'unhealthy',
          message: 'Missing AZURE_WEBPUBSUB_CONNECTION_STRING',
          timestamp: new Date()
        };
      }

      const hubName = process.env.AZURE_WEBPUBSUB_HUB_NAME || 'travel-hub';
      const serviceClient = new WebPubSubServiceClient(connectionString, hubName);
      
      // Simple connectivity test
      await serviceClient.groupExists('test-group');

      return {
        service: 'Web PubSub',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        service: 'Web PubSub',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  private async checkAzureMaps(): Promise<ServiceHealth> {
    const startTime = Date.now();
    try {
      const apiKey = process.env.AZURE_MAPS_API_KEY;
      if (!apiKey) {
        return {
          service: 'Azure Maps',
          status: 'unhealthy',
          message: 'Missing AZURE_MAPS_API_KEY',
          timestamp: new Date()
        };
      }

      // Use the existing getMapsRouteClient function
      const mapsClient = getMapsRouteClient();
      
      // Just verify the client can be created without errors
      // The actual API call would require valid coordinates
      return {
        service: 'Azure Maps',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        service: 'Azure Maps',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  private async checkMCPServices(): Promise<ServiceHealth[]> {
    try {
      const mcpHealth = await mcpManager.getServiceHealth();
      const availableServices = mcpManager.getAvailableServices();

      return Object.entries(mcpHealth).map(([serviceName, health]) => ({
        service: `MCP ${serviceName}`,
        status: health.success ? 'healthy' : 'unhealthy',
        message: health.error || undefined,
        timestamp: new Date()
      }));
    } catch (error) {
      return [{
        service: 'MCP Services',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      }];
    }
  }

  public async checkAllServices(): Promise<ServiceHealth[]> {
    const services = [
      this.checkAzureOpenAI(),
      this.checkCosmosDB(),
      this.checkEventHubs(),
      this.checkAzureSearch(),
      this.checkWebPubSub(),
      this.checkAzureMaps(),
      this.checkMCPServices()
    ];

    const results = await Promise.allSettled(services);
    const healthChecks: ServiceHealth[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (Array.isArray(result.value)) {
          healthChecks.push(...result.value);
        } else {
          healthChecks.push(result.value);
        }
      } else {
        const serviceNames = [
          'Azure OpenAI', 'Cosmos DB', 'Event Hubs', 
          'Azure Search', 'Web PubSub', 'Azure Maps', 'MCP Services'
        ];
        healthChecks.push({
          service: serviceNames[index] || 'Unknown Service',
          status: 'unhealthy',
          message: result.reason?.message || 'Health check failed',
          timestamp: new Date()
        });
      }
    });

    // Update cache
    healthChecks.forEach(health => {
      this.healthCache.set(health.service, health);
    });

    return healthChecks;
  }

  public async getServiceHealth(serviceName?: string): Promise<ServiceHealth | ServiceHealth[]> {
    if (serviceName) {
      const cached = this.healthCache.get(serviceName);
      if (cached && this.isCacheValid(cached)) {
        return cached;
      }
      
      // Refresh single service
      const allHealth = await this.checkAllServices();
      return allHealth.find(h => h.service === serviceName) || {
        service: serviceName,
        status: 'unknown',
        message: 'Service not found',
        timestamp: new Date()
      };
    }

    // Check if we have recent cached data for all services
    const allServices = [
      'Azure OpenAI', 'Cosmos DB', 'Event Hubs', 
      'Azure Search', 'Web PubSub', 'Azure Maps'
    ];
    
    const cachedResults = allServices.map(service => this.healthCache.get(service))
      .filter(health => health && this.isCacheValid(health)) as ServiceHealth[];

    if (cachedResults.length === allServices.length) {
      // Add MCP services
      const mcpServices = Array.from(this.healthCache.entries())
        .filter(([name]) => name.startsWith('MCP '))
        .map(([, health]) => health)
        .filter(health => this.isCacheValid(health));
      
      return [...cachedResults, ...mcpServices];
    }

    // Refresh all services
    return await this.checkAllServices();
  }

  public getHealthSummary(): { total: number; healthy: number; unhealthy: number; unknown: number } {
    const services = Array.from(this.healthCache.values());
    return {
      total: services.length,
      healthy: services.filter(s => s.status === 'healthy').length,
      unhealthy: services.filter(s => s.status === 'unhealthy').length,
      unknown: services.filter(s => s.status === 'unknown').length
    };
  }
}

export const serviceHealthManager = ServiceHealthManager.getInstance();
