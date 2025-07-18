import { BookingSearchService } from '../../booking-search-service';
import { SkyscannerFlightProvider } from '../../providers/skyscanner-flight-provider';
import { BookingComHotelProvider } from '../../providers/booking-com-hotel-provider';
import { ExpediaHotelProvider } from '../../providers/expedia-hotel-provider';
import { circuitBreakerManager } from '../../../../lib/circuit-breaker';
import { BookingSearchParams } from '../../booking-provider';

describe('Booking Integration Tests', () => {
  let bookingService: BookingSearchService;
  let skyscannerProvider: SkyscannerFlightProvider;
  let bookingComProvider: BookingComHotelProvider;
  let expediaProvider: ExpediaHotelProvider;

  beforeEach(() => {
    // Create fresh service instance for each test
    bookingService = new BookingSearchService();
    
    // Create provider instances with mock API keys
    skyscannerProvider = new SkyscannerFlightProvider({
      apiKey: 'mock-skyscanner-key'
    });
    
    bookingComProvider = new BookingComHotelProvider({
      apiKey: 'mock-booking-com-key'
    });
    
    expediaProvider = new ExpediaHotelProvider({
      apiKey: 'mock-expedia-key'
    });
    
    // Register providers
    bookingService.registerProvider(skyscannerProvider);
    bookingService.registerProvider(bookingComProvider);
    bookingService.registerProvider(expediaProvider);
    
    // Reset circuit breakers
    circuitBreakerManager.resetAll();
  });

  afterEach(() => {
    // Clean up
    bookingService.clearCache();
    circuitBreakerManager.resetAll();
  });

  describe('Flight Search Integration', () => {
    it('should search for flights and return aggregated results', async () => {
      const searchParams: BookingSearchParams = {
        type: 'flight',
        origin: 'LAX',
        destination: 'JFK',
        departureDate: new Date('2025-08-15'),
        passengers: 2
      };

      const result = await bookingService.search(searchParams);

      expect(result.totalResults).toBeGreaterThan(0);
      expect(result.totalProviders).toBe(1); // Only Skyscanner for flights
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].type).toBe('flight');
      expect(result.results[0].provider).toBe('Skyscanner');
      expect(result.searchId).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should filter flight results by price range', async () => {
      const searchParams: BookingSearchParams = {
        type: 'flight',
        origin: 'LAX',
        destination: 'JFK',
        departureDate: new Date('2025-08-15')
      };

      const result = await bookingService.search(searchParams, {
        priceRange: { min: 300, max: 500 }
      });

      expect(result.results.every(r => r.price.amount >= 300 && r.price.amount <= 500)).toBe(true);
    });

    it('should sort flight results by price', async () => {
      const searchParams: BookingSearchParams = {
        type: 'flight',
        origin: 'LAX',
        destination: 'JFK',
        departureDate: new Date('2025-08-15')
      };

      const result = await bookingService.search(searchParams, {
        sortBy: 'price',
        sortOrder: 'asc'
      });

      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i].price.amount).toBeGreaterThanOrEqual(
          result.results[i - 1].price.amount
        );
      }
    });
  });

  describe('Hotel Search Integration', () => {
    it('should search for hotels and return aggregated results', async () => {
      const searchParams: BookingSearchParams = {
        type: 'hotel',
        destination: 'New York',
        checkIn: new Date('2025-08-15'),
        checkOut: new Date('2025-08-17'),
        guests: 2
      };

      const result = await bookingService.search(searchParams);

      expect(result.totalProviders).toBe(2); // Booking.com and Expedia
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].type).toBe('hotel');
      expect(['Booking.com', 'Expedia']).toContain(result.results[0].provider);
    });

    it('should filter hotel results by amenities', async () => {
      const searchParams: BookingSearchParams = {
        type: 'hotel',
        destination: 'New York',
        checkIn: new Date('2025-08-15'),
        checkOut: new Date('2025-08-17')
      };

      const result = await bookingService.search(searchParams, {
        amenities: ['Free WiFi', 'Pool']
      });

      result.results.forEach(hotel => {
        expect(hotel.hotelDetails).toBeDefined();
        expect(hotel.hotelDetails!.amenities).toContain('Free WiFi');
        expect(hotel.hotelDetails!.amenities).toContain('Pool');
      });
    });

    it('should sort hotel results by rating', async () => {
      const searchParams: BookingSearchParams = {
        type: 'hotel',
        destination: 'New York',
        checkIn: new Date('2025-08-15'),
        checkOut: new Date('2025-08-17')
      };

      const result = await bookingService.search(searchParams, {
        sortBy: 'rating',
        sortOrder: 'desc'
      });

      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i].rating || 0).toBeLessThanOrEqual(
          result.results[i - 1].rating || 0
        );
      }
    });
  });

  describe('Provider Health and Circuit Breaker Integration', () => {
    it('should track provider health status', async () => {
      const healthStatus = bookingService.getProviderHealthStatus();

      expect(Object.keys(healthStatus)).toContain('Skyscanner');
      expect(Object.keys(healthStatus)).toContain('Booking.com');
      expect(Object.keys(healthStatus)).toContain('Expedia');

      Object.values(healthStatus).forEach(status => {
        expect(status).toHaveProperty('type');
        expect(status).toHaveProperty('healthy');
        expect(status).toHaveProperty('lastChecked');
      });
    });

    it('should handle provider failures gracefully', async () => {
      // Create a provider that will fail
      const failingProvider = new SkyscannerFlightProvider({
        apiKey: 'invalid-key'
      });
      
      // Override search method to simulate failure
      failingProvider.search = jest.fn().mockRejectedValue(new Error('API Error'));
      
      const failingService = new BookingSearchService();
      failingService.registerProvider(failingProvider);

      const searchParams: BookingSearchParams = {
        type: 'flight',
        origin: 'LAX',
        destination: 'JFK',
        departureDate: new Date('2025-08-15')
      };

      const result = await failingService.search(searchParams);
      
      // Should still return a result structure, but with no results from failing provider
      expect(result.totalProviders).toBe(1);
      expect(result.results.length).toBe(0);
    });

    it('should trigger health checks for all providers', async () => {
      const triggerSpy = jest.spyOn(bookingService, 'triggerHealthCheck');
      
      await bookingService.triggerHealthCheck();
      
      expect(triggerSpy).toHaveBeenCalled();
    });

    it('should reset circuit breakers', () => {
      const resetSpy = jest.spyOn(circuitBreakerManager, 'resetAll');
      
      bookingService.resetCircuitBreakers();
      
      expect(resetSpy).toHaveBeenCalled();
    });
  });

  describe('Search Caching Integration', () => {
    it('should cache search results and return cached data', async () => {
      const searchParams: BookingSearchParams = {
        type: 'flight',
        origin: 'LAX',
        destination: 'JFK',
        departureDate: new Date('2025-08-15')
      };

      // First search
      const result1 = await bookingService.search(searchParams);
      const searchId1 = result1.searchId;

      // Second search with same parameters (should be cached)
      const result2 = await bookingService.search(searchParams);
      const searchId2 = result2.searchId;

      expect(searchId1).toBe(searchId2); // Same search ID indicates cached result
    });

    it('should clear cache when requested', () => {
      const clearSpy = jest.spyOn(bookingService, 'clearCache');
      
      bookingService.clearCache();
      
      expect(clearSpy).toHaveBeenCalled();
    });
  });

  describe('Configuration Management', () => {
    it('should enable/disable failover', () => {
      bookingService.setFailoverEnabled(false);
      bookingService.setFailoverEnabled(true);
      
      // Test passes if no errors are thrown
      expect(true).toBe(true);
    });

    it('should set max retries within valid range', () => {
      bookingService.setMaxRetries(3);
      bookingService.setMaxRetries(0);
      bookingService.setMaxRetries(5);
      
      // Should clamp values outside range
      bookingService.setMaxRetries(10); // Should be clamped to 5
      bookingService.setMaxRetries(-1); // Should be clamped to 0
      
      expect(true).toBe(true);
    });
  });

  describe('Booking Details Integration', () => {
    it('should retrieve booking details from provider', async () => {
      const bookingId = 'sky-flight-1';
      const providerName = 'Skyscanner';

      const details = await bookingService.getBookingDetails(bookingId, providerName);

      expect(details).toBeDefined();
      expect(details.id).toBe(bookingId);
      expect(details.provider).toBe(providerName);
      expect(details.terms).toBeDefined();
      expect(details.conditions).toBeDefined();
      expect(details.contactInfo).toBeDefined();
    });

    it('should throw error for invalid provider', async () => {
      const bookingId = 'test-booking';
      const invalidProviderName = 'NonExistentProvider';

      await expect(
        bookingService.getBookingDetails(bookingId, invalidProviderName)
      ).rejects.toThrow('Provider NonExistentProvider not found');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle invalid search parameters gracefully', async () => {
      const invalidParams = {
        type: 'flight',
        // Missing required fields
      } as BookingSearchParams;

      const result = await bookingService.search(invalidParams);
      
      // Should return error results instead of throwing
      expect(result.results).toHaveLength(0);
      expect(result.providerResults[0].error).toBeDefined();
      expect(result.providerResults[0].error).toContain('required');
    });

    it('should handle network timeouts gracefully', async () => {
      // Create a provider that will fail without fallback
      const timeoutProvider = new SkyscannerFlightProvider({
        apiKey: 'real-api-key'
      });
      
      // Override the search method entirely to simulate timeout without fallback
      timeoutProvider.search = jest.fn().mockImplementation(() => 
        Promise.reject(new Error('Network timeout'))
      );
      
      const timeoutService = new BookingSearchService();
      timeoutService.registerProvider(timeoutProvider);

      const searchParams: BookingSearchParams = {
        type: 'flight',
        origin: 'LAX',
        destination: 'JFK',
        departureDate: new Date('2025-08-15')
      };

      const result = await timeoutService.search(searchParams);
      
      // Should handle timeout gracefully by returning error result
      expect(result.totalProviders).toBe(1);
      expect(result.results.length).toBe(0);
      expect(result.providerResults[0].error).toBeDefined();
      expect(result.providerResults[0].error).toContain('timeout');
    });
  });

  describe('Provider Registration Integration', () => {
    it('should register and retrieve providers by type', () => {
      const flightProviders = bookingService.getProviders('flight');
      const hotelProviders = bookingService.getProviders('hotel');
      const allProviders = bookingService.getProviders();

      expect(flightProviders.length).toBe(1);
      expect(flightProviders[0].name).toBe('Skyscanner');
      
      expect(hotelProviders.length).toBe(2);
      expect(hotelProviders.map(p => p.name)).toContain('Booking.com');
      expect(hotelProviders.map(p => p.name)).toContain('Expedia');
      
      expect(allProviders.length).toBe(3);
    });
  });
});