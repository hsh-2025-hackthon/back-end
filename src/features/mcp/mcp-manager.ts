import { BaseMCP, MCPResponse } from './base-mcp';
import { WeatherMCP } from './weather-mcp';
import { MapsMCP } from './maps-mcp';
import { ExchangeRateMCP } from './exchange-rate-mcp';
import { TravelInfoMCP } from './travel-info-mcp';

export interface MCPServices {
  weather: WeatherMCP;
  maps: MapsMCP;
  exchangeRate: ExchangeRateMCP;
  travelInfo: TravelInfoMCP;
}

export class MCPManager {
  private services: Partial<MCPServices> = {};
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeServices();
    this.startHealthChecks();
  }

  private initializeServices(): void {
    try {
      // Initialize Weather MCP
      if (process.env.OPENWEATHER_API_KEY) {
        this.services.weather = new WeatherMCP({
          apiKey: process.env.OPENWEATHER_API_KEY,
          baseUrl: 'https://api.openweathermap.org/data/2.5',
        });
      }

      // Initialize Maps MCP (Azure Maps)
      if (process.env.AZURE_MAPS_KEY) {
        this.services.maps = new MapsMCP({
          apiKey: process.env.AZURE_MAPS_KEY,
          baseUrl: 'https://atlas.microsoft.com',
        });
      }

      // Initialize Exchange Rate MCP
      if (process.env.EXCHANGE_RATE_API_KEY) {
        this.services.exchangeRate = new ExchangeRateMCP({
          apiKey: process.env.EXCHANGE_RATE_API_KEY,
          baseUrl: 'https://api.exchangerate-api.com/v4',
        });
      }

      // Initialize Travel Info MCP
      if (process.env.TRAVEL_INFO_API_KEY) {
        this.services.travelInfo = new TravelInfoMCP({
          apiKey: process.env.TRAVEL_INFO_API_KEY,
          baseUrl: 'https://api.tripadvisor.com/api',
        });
      }

      console.log('[MCPManager] Services initialized:', Object.keys(this.services));
    } catch (error) {
      console.error('[MCPManager] Failed to initialize services:', error);
    }
  }

  private startHealthChecks(): void {
    // Check health every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 5 * 60 * 1000);
  }

  private async performHealthChecks(): Promise<void> {
    const services = Object.entries(this.services);
    
    for (const [name, service] of services) {
      try {
        const health = await service.healthCheck();
        if (!health.success) {
          console.warn(`[MCPManager] Health check failed for ${name}:`, health.error);
        }
      } catch (error) {
        console.error(`[MCPManager] Health check error for ${name}:`, error);
      }
    }
  }

  public getService<K extends keyof MCPServices>(serviceName: K): MCPServices[K] | undefined {
    return this.services[serviceName] as MCPServices[K];
  }

  public async getServiceHealth(): Promise<Record<string, MCPResponse<{ status: string }>>> {
    const health: Record<string, MCPResponse<{ status: string }>> = {};
    
    for (const [name, service] of Object.entries(this.services)) {
      try {
        health[name] = await service.healthCheck();
      } catch (error) {
        health[name] = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          metadata: {
            timestamp: new Date(),
            source: 'MCPManager',
          },
        };
      }
    }
    
    return health;
  }

  public getAvailableServices(): string[] {
    return Object.keys(this.services);
  }

  public shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    console.log('[MCPManager] Shutdown completed');
  }
}

// Singleton instance
export const mcpManager = new MCPManager();
