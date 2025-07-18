import { 
  BookingProvider, 
  BookingSearchParams, 
  BookingSearchResult, 
  BookingOption,
  BookingDetails 
} from './booking-provider';
import { circuitBreakerManager } from '../../lib/circuit-breaker';

export interface AggregatedSearchResult {
  searchId: string;
  timestamp: Date;
  totalProviders: number;
  totalResults: number;
  results: BookingOption[];
  providerResults: BookingSearchResult[];
  filters: {
    priceRange: { min: number; max: number; currency: string };
    providers: string[];
    types: string[];
    ratings: number[];
  };
}

export interface SearchFilters {
  providers?: string[];
  priceRange?: { min: number; max: number };
  rating?: { min: number };
  amenities?: string[];
  airlines?: string[];
  stopOptions?: ('direct' | '1_stop' | 'multi_stop')[];
  sortBy?: 'price' | 'rating' | 'duration' | 'departure_time';
  sortOrder?: 'asc' | 'desc';
}

export class BookingSearchService {
  private providers: Map<string, BookingProvider> = new Map();
  private searchCache: Map<string, AggregatedSearchResult> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private enableFailover = true;
  private maxRetries = 2;
  
  registerProvider(provider: BookingProvider): void {
    this.providers.set(provider.name, provider);
    console.log(`Registered booking provider: ${provider.name} (${provider.type})`);
  }
  
  getProviders(type?: 'flight' | 'hotel' | 'activity'): BookingProvider[] {
    const providers = Array.from(this.providers.values());
    return type ? providers.filter(p => p.type === type) : providers;
  }
  
  async search(
    params: BookingSearchParams, 
    filters?: SearchFilters
  ): Promise<AggregatedSearchResult> {
    const cacheKey = this.generateCacheKey(params, filters);
    
    // Check cache first
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp.getTime() < this.cacheTimeout) {
      console.log('Returning cached search results');
      return cached;
    }
    
    // Get relevant providers
    const relevantProviders = this.getProviders(params.type);
    if (filters?.providers) {
      const filteredProviders = relevantProviders.filter(
        p => filters.providers!.includes(p.name)
      );
      if (filteredProviders.length > 0) {
        relevantProviders.splice(0, relevantProviders.length, ...filteredProviders);
      }
    }
    
    if (relevantProviders.length === 0) {
      throw new Error(`No providers available for ${params.type} bookings`);
    }
    
    console.log(`Searching with ${relevantProviders.length} providers for ${params.type}`);
    
    // Search with all relevant providers - use failover strategy if enabled
    const searchPromises = relevantProviders.map(async (provider) => {
      return this.searchWithProvider(provider, params);
    });
    
    const providerResults = await Promise.all(searchPromises);
    
    // Aggregate and filter results
    let allResults: BookingOption[] = [];
    providerResults.forEach(result => {
      allResults = allResults.concat(result.results);
    });
    
    // Apply filters
    const filteredResults = this.applyFilters(allResults, filters);
    
    // Sort results
    const sortedResults = this.sortResults(filteredResults, filters);
    
    // Calculate aggregated metadata
    const priceRange = this.calculatePriceRange(sortedResults);
    const aggregated: AggregatedSearchResult = {
      searchId: `agg-${Date.now()}`,
      timestamp: new Date(),
      totalProviders: relevantProviders.length,
      totalResults: sortedResults.length,
      results: sortedResults,
      providerResults,
      filters: {
        priceRange,
        providers: relevantProviders.map(p => p.name),
        types: Array.from(new Set(sortedResults.map(r => r.type))),
        ratings: Array.from(new Set(sortedResults.map(r => r.rating || 0))).sort((a, b) => b - a)
      }
    };
    
    // Cache the result
    this.searchCache.set(cacheKey, aggregated);
    
    return aggregated;
  }
  
  async getBookingDetails(
    bookingId: string, 
    providerName: string
  ): Promise<BookingDetails> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }
    
    return provider.getDetails(bookingId);
  }
  
  async getProviderAvailability(): Promise<Record<string, boolean>> {
    const availability: Record<string, boolean> = {};
    
    const healthChecks = Array.from(this.providers.entries()).map(
      async ([name, provider]) => {
        try {
          // Simple health check - attempt a minimal search
          const testParams: BookingSearchParams = {
            type: provider.type,
            destination: 'TEST',
            checkIn: new Date(),
            checkOut: new Date(Date.now() + 86400000) // Tomorrow
          };
          
          // Set a timeout for the health check
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          );
          
          await Promise.race([provider.search(testParams), timeoutPromise]);
          availability[name] = true;
        } catch (error) {
          console.error(`Provider ${name} health check failed:`, error);
          availability[name] = false;
        }
      }
    );
    
    await Promise.all(healthChecks);
    return availability;
  }
  
  private applyFilters(results: BookingOption[], filters?: SearchFilters): BookingOption[] {
    if (!filters) return results;
    
    return results.filter(result => {
      // Price range filter
      if (filters.priceRange) {
        const price = result.price.amount;
        if (price < filters.priceRange.min || price > filters.priceRange.max) {
          return false;
        }
      }
      
      // Rating filter
      if (filters.rating && result.rating) {
        if (result.rating < filters.rating.min) {
          return false;
        }
      }
      
      // Amenities filter (for hotels)
      if (filters.amenities && result.hotelDetails) {
        const hasAllAmenities = filters.amenities.every(amenity =>
          result.hotelDetails!.amenities.includes(amenity)
        );
        if (!hasAllAmenities) {
          return false;
        }
      }
      
      // Airlines filter (for flights)
      if (filters.airlines && result.flightDetails) {
        if (!filters.airlines.includes(result.flightDetails.airline)) {
          return false;
        }
      }
      
      // Stop options filter (for flights)
      if (filters.stopOptions && result.flightDetails) {
        const stops = result.flightDetails.stops;
        const stopType = stops === 0 ? 'direct' : 
                        stops === 1 ? '1_stop' : 'multi_stop';
        if (!filters.stopOptions.includes(stopType)) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  private sortResults(results: BookingOption[], filters?: SearchFilters): BookingOption[] {
    if (!filters?.sortBy) {
      // Default sort by price ascending
      return results.sort((a, b) => a.price.amount - b.price.amount);
    }
    
    const sortOrder = filters.sortOrder || 'asc';
    const multiplier = sortOrder === 'asc' ? 1 : -1;
    
    return results.sort((a, b) => {
      switch (filters.sortBy) {
        case 'price':
          return (a.price.amount - b.price.amount) * multiplier;
        case 'rating':
          return ((a.rating || 0) - (b.rating || 0)) * multiplier;
        case 'duration':
          // For flights, sort by duration
          if (a.flightDetails && b.flightDetails) {
            // Parse duration strings (e.g., "2h 30m")
            const parseHours = (duration: string) => {
              const match = duration.match(/(\d+)h?\s*(\d+)?m?/);
              return match ? parseInt(match[1]) + (parseInt(match[2] || '0') / 60) : 0;
            };
            return (parseHours(a.flightDetails.duration) - parseHours(b.flightDetails.duration)) * multiplier;
          }
          return 0;
        case 'departure_time':
          // For flights, sort by departure time
          if (a.flightDetails && b.flightDetails) {
            return (a.flightDetails.departure.time.getTime() - b.flightDetails.departure.time.getTime()) * multiplier;
          }
          return 0;
        default:
          return 0;
      }
    });
  }
  
  private calculatePriceRange(results: BookingOption[]): { min: number; max: number; currency: string } {
    if (results.length === 0) {
      return { min: 0, max: 0, currency: 'USD' };
    }
    
    const prices = results.map(r => r.price.amount);
    const currency = results[0]?.price.currency || 'USD';
    
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      currency
    };
  }
  
  private generateCacheKey(params: BookingSearchParams, filters?: SearchFilters): string {
    const key = {
      ...params,
      filters,
      // Round dates to nearest hour for better cache hits
      checkIn: params.checkIn ? new Date(Math.floor(params.checkIn.getTime() / 3600000) * 3600000) : undefined,
      checkOut: params.checkOut ? new Date(Math.floor(params.checkOut.getTime() / 3600000) * 3600000) : undefined,
      departureDate: params.departureDate ? new Date(Math.floor(params.departureDate.getTime() / 3600000) * 3600000) : undefined,
      returnDate: params.returnDate ? new Date(Math.floor(params.returnDate.getTime() / 3600000) * 3600000) : undefined,
    };
    
    return JSON.stringify(key);
  }
  
  clearCache(): void {
    this.searchCache.clear();
    console.log('Booking search cache cleared');
  }
  
  private async searchWithProvider(
    provider: BookingProvider, 
    params: BookingSearchParams
  ): Promise<BookingSearchResult> {
    const circuitBreakerName = `${provider.name}-${provider.type}`;
    
    try {
      // Check if provider is healthy via circuit breaker
      const circuitBreaker = circuitBreakerManager.getCircuitBreaker(circuitBreakerName);
      const isProviderHealthy = !circuitBreaker || circuitBreaker.getStats().state !== 'OPEN';
      
      if (!isProviderHealthy && this.enableFailover) {
        console.log(`Provider ${provider.name} is unhealthy, skipping...`);
        return this.createErrorResult(provider.name, 'Provider unhealthy - circuit breaker OPEN');
      }
      
      const result = await this.executeSearchWithRetry(provider, params);
      console.log(`${provider.name} returned ${result.results.length} results`);
      return result;
      
    } catch (error) {
      console.error(`Error searching with ${provider.name}:`, error);
      return this.createErrorResult(provider.name, error instanceof Error ? error.message : 'Unknown error');
    }
  }
  
  private async executeSearchWithRetry(
    provider: BookingProvider, 
    params: BookingSearchParams
  ): Promise<BookingSearchResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`Retry attempt ${attempt - 1} for ${provider.name}`);
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 2) * 1000));
        }
        
        return await provider.search(params);
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.error(`Attempt ${attempt} failed for ${provider.name}:`, error);
        
        if (attempt === this.maxRetries + 1) {
          break;
        }
      }
    }
    
    throw lastError || new Error('All retry attempts failed');
  }
  
  private createErrorResult(providerName: string, errorMessage: string): BookingSearchResult {
    return {
      provider: providerName,
      results: [],
      searchId: `error-${Date.now()}`,
      timestamp: new Date(),
      totalResults: 0,
      error: errorMessage
    };
  }
  
  getProviderHealthStatus(): Record<string, any> {
    const healthStatus: Record<string, any> = {};
    const circuitBreakerStats = circuitBreakerManager.getAllStats();
    
    this.providers.forEach((provider, name) => {
      const circuitBreakerName = `${provider.name}-${provider.type}`;
      const stats = circuitBreakerStats[circuitBreakerName];
      
      healthStatus[name] = {
        type: provider.type,
        healthy: !stats || stats.state !== 'OPEN',
        circuitBreakerStats: stats || null,
        lastChecked: new Date().toISOString()
      };
    });
    
    return healthStatus;
  }
  
  async triggerHealthCheck(): Promise<void> {
    console.log('Triggering health check for all providers...');
    
    const healthChecks = Array.from(this.providers.values()).map(async (provider) => {
      try {
        const testParams: BookingSearchParams = {
          type: provider.type,
          destination: 'TEST_HEALTH_CHECK',
          checkIn: new Date(),
          checkOut: new Date(Date.now() + 86400000)
        };
        
        await provider.search(testParams);
        console.log(`Health check passed for ${provider.name}`);
      } catch (error) {
        console.log(`Health check failed for ${provider.name}:`, error);
      }
    });
    
    await Promise.allSettled(healthChecks);
    console.log('Health check completed for all providers');
  }
  
  resetCircuitBreakers(): void {
    circuitBreakerManager.resetAll();
    console.log('All circuit breakers have been reset');
  }
  
  setFailoverEnabled(enabled: boolean): void {
    this.enableFailover = enabled;
    console.log(`Provider failover ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  setMaxRetries(retries: number): void {
    this.maxRetries = Math.max(0, Math.min(5, retries)); // Limit between 0-5
    console.log(`Max retries set to ${this.maxRetries}`);
  }
}

// Singleton instance
export const bookingSearchService = new BookingSearchService();
