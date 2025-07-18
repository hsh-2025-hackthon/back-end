export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit is open, failing fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service has recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Number of failures before opening circuit
  resetTimeout: number;        // Time in ms before attempting to reset
  monitoringPeriod: number;    // Time window for monitoring failures in ms
  successThreshold: number;    // Number of successes needed to close circuit in HALF_OPEN
  timeout: number;             // Request timeout in ms
  name: string;                // Circuit breaker name for logging
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextAttempt?: Date;
  uptime: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private totalRequests: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttempt?: Date;
  private failures: Date[] = []; // Track failures in the monitoring window
  
  constructor(private config: CircuitBreakerConfig) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalRequests++;
    
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        console.log(`Circuit breaker ${this.config.name}: Attempting reset (HALF_OPEN)`);
      } else {
        throw new Error(`Circuit breaker ${this.config.name} is OPEN - failing fast`);
      }
    }
    
    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);
      
      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
  
  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = new Date();
    
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.failures = [];
        console.log(`Circuit breaker ${this.config.name}: Closed after successful recovery`);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
      this.failures = [];
    }
  }
  
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    this.failures.push(new Date());
    
    // Clean up old failures outside monitoring window
    const cutoff = Date.now() - this.config.monitoringPeriod;
    this.failures = this.failures.filter(failure => failure.getTime() > cutoff);
    
    // Check if we should open the circuit
    if (this.state === CircuitState.CLOSED && this.failures.length >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = new Date(Date.now() + this.config.resetTimeout);
      console.log(`Circuit breaker ${this.config.name}: Opened due to ${this.failures.length} failures`);
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Return to OPEN state on any failure in HALF_OPEN
      this.state = CircuitState.OPEN;
      this.nextAttempt = new Date(Date.now() + this.config.resetTimeout);
      console.log(`Circuit breaker ${this.config.name}: Returned to OPEN after failure in HALF_OPEN`);
    }
  }
  
  private shouldAttemptReset(): boolean {
    return this.nextAttempt ? Date.now() >= this.nextAttempt.getTime() : false;
  }
  
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttempt: this.nextAttempt,
      uptime: this.calculateUptime()
    };
  }
  
  private calculateUptime(): number {
    if (!this.lastFailureTime) return 100;
    
    const now = Date.now();
    const totalTime = now - (this.lastFailureTime.getTime() - this.config.monitoringPeriod);
    const downTime = this.failures.reduce((total, failure) => {
      return total + Math.min(this.config.resetTimeout, now - failure.getTime());
    }, 0);
    
    return Math.max(0, Math.min(100, ((totalTime - downTime) / totalTime) * 100));
  }
  
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.failures = [];
    this.nextAttempt = undefined;
    console.log(`Circuit breaker ${this.config.name}: Manually reset`);
  }
  
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = new Date(Date.now() + this.config.resetTimeout);
    console.log(`Circuit breaker ${this.config.name}: Manually opened`);
  }
}

export class CircuitBreakerManager {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  
  createCircuitBreaker(name: string, config: Partial<CircuitBreakerConfig> = {}): CircuitBreaker {
    const defaultConfig: CircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 120000, // 2 minutes
      successThreshold: 3,
      timeout: 30000, // 30 seconds
      name
    };
    
    const finalConfig = { ...defaultConfig, ...config, name };
    const circuitBreaker = new CircuitBreaker(finalConfig);
    this.circuitBreakers.set(name, circuitBreaker);
    
    console.log(`Created circuit breaker: ${name}`);
    return circuitBreaker;
  }
  
  getCircuitBreaker(name: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(name);
  }
  
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    this.circuitBreakers.forEach((cb, name) => {
      stats[name] = cb.getStats();
    });
    return stats;
  }
  
  resetAll(): void {
    this.circuitBreakers.forEach(cb => cb.reset());
    console.log('All circuit breakers have been reset');
  }
  
  getHealthySystems(): string[] {
    const healthy: string[] = [];
    this.circuitBreakers.forEach((cb, name) => {
      if (cb.getStats().state !== CircuitState.OPEN) {
        healthy.push(name);
      }
    });
    return healthy;
  }
  
  getUnhealthySystems(): string[] {
    const unhealthy: string[] = [];
    this.circuitBreakers.forEach((cb, name) => {
      if (cb.getStats().state === CircuitState.OPEN) {
        unhealthy.push(name);
      }
    });
    return unhealthy;
  }
}

// Singleton instance
export const circuitBreakerManager = new CircuitBreakerManager();