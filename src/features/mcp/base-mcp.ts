export interface MCPConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  rateLimitPerMinute?: number;
}

export interface MCPResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    timestamp: Date;
    source: string;
    cached?: boolean;
  };
}

export abstract class BaseMCP {
  protected config: MCPConfig;
  protected serviceName: string;
  protected requestCount: Map<string, number[]> = new Map();

  constructor(config: MCPConfig) {
    this.config = {
      timeout: 10000,
      rateLimitPerMinute: 60,
      ...config,
    };
    this.serviceName = this.constructor.name;
  }

  /**
   * Check if the rate limit has been exceeded
   */
  protected checkRateLimit(key: string = 'default'): boolean {
    const now = Date.now();
    const requests = this.requestCount.get(key) || [];
    
    // Remove requests older than 1 minute
    const recentRequests = requests.filter(time => now - time < 60000);
    
    if (recentRequests.length >= this.config.rateLimitPerMinute!) {
      return false;
    }
    
    recentRequests.push(now);
    this.requestCount.set(key, recentRequests);
    return true;
  }

  /**
   * Make a rate-limited HTTP request
   */
  protected async makeRequest<T>(
    url: string,
    options: RequestInit = {},
    cacheKey?: string
  ): Promise<MCPResponse<T>> {
    const rateLimitKey = cacheKey || url;
    
    if (!this.checkRateLimit(rateLimitKey)) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        metadata: {
          timestamp: new Date(),
          source: this.constructor.name,
        },
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        data,
        metadata: {
          timestamp: new Date(),
          source: this.constructor.name,
        },
      };
    } catch (error) {
      console.error(`[${this.serviceName}] MCP request failed:`, { url, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          timestamp: new Date(),
          source: this.constructor.name,
        },
      };
    }
  }

  /**
   * Health check method to verify the MCP service is available
   */
  abstract healthCheck(): Promise<MCPResponse<{ status: string }>>;

  /**
   * Get the service name for logging and identification
   */
  abstract getServiceName(): string;
}
