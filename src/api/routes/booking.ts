import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { bookingSearchService } from '../../features/booking/booking-search-service';
import { SkyscannerFlightProvider } from '../../features/booking/providers/skyscanner-flight-provider';
import { BookingComHotelProvider } from '../../features/booking/providers/booking-com-hotel-provider';
import { ExpediaHotelProvider } from '../../features/booking/providers/expedia-hotel-provider';
import { 
  BookingSearchParams
} from '../../features/booking/booking-provider';
import { 
  SearchFilters 
} from '../../features/booking/booking-search-service';

const router = Router();

// Initialize booking providers
const initializeProviders = () => {
  // Initialize Skyscanner (mock for now)
  const skyscannerProvider = new SkyscannerFlightProvider({
    apiKey: process.env.SKYSCANNER_API_KEY || 'mock-api-key'
  });
  
  // Initialize Booking.com (mock for now)
  const bookingComProvider = new BookingComHotelProvider({
    apiKey: process.env.BOOKING_COM_API_KEY || 'mock-api-key'
  });
  
  // Initialize Expedia (mock for now)
  const expediaProvider = new ExpediaHotelProvider({
    apiKey: process.env.EXPEDIA_API_KEY || 'mock-api-key'
  });
  
  bookingSearchService.registerProvider(skyscannerProvider);
  bookingSearchService.registerProvider(bookingComProvider);
  bookingSearchService.registerProvider(expediaProvider);
  
  console.log('Initialized booking providers: Skyscanner (flights), Booking.com (hotels), Expedia (hotels)');
};

// Initialize providers on startup
initializeProviders();

/**
 * POST /api/booking/flights/search
 * Search for flight options
 */
router.post('/flights/search', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      origin,
      destination,
      departureDate,
      returnDate,
      passengers = 1,
      budget,
      filters
    } = req.body;

    // Validate required fields
    if (!origin || !destination || !departureDate) {
      return res.status(400).json({
        error: 'Origin, destination, and departure date are required'
      });
    }

    // Parse dates
    const parsedDepartureDate = new Date(departureDate);
    const parsedReturnDate = returnDate ? new Date(returnDate) : undefined;

    // Validate dates
    if (isNaN(parsedDepartureDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid departure date format'
      });
    }

    if (parsedReturnDate && isNaN(parsedReturnDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid return date format'
      });
    }

    const searchParams: BookingSearchParams = {
      type: 'flight',
      origin,
      destination,
      departureDate: parsedDepartureDate,
      returnDate: parsedReturnDate,
      passengers,
      budget
    };

    const searchFilters: SearchFilters | undefined = filters;

    const results = await bookingSearchService.search(searchParams, searchFilters);

    res.json({
      success: true,
      searchId: results.searchId,
      timestamp: results.timestamp,
      totalProviders: results.totalProviders,
      totalResults: results.totalResults,
      results: results.results,
      filters: results.filters,
      searchParams
    });

  } catch (error) {
    console.error('Flight search error:', error);
    res.status(500).json({
      error: 'Flight search failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/booking/hotels/search
 * Search for hotel options
 */
router.post('/hotels/search', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      destination,
      checkIn,
      checkOut,
      guests = 1,
      budget,
      filters
    } = req.body;

    // Validate required fields
    if (!destination || !checkIn || !checkOut) {
      return res.status(400).json({
        error: 'Destination, check-in, and check-out dates are required'
      });
    }

    // Parse dates
    const parsedCheckIn = new Date(checkIn);
    const parsedCheckOut = new Date(checkOut);

    // Validate dates
    if (isNaN(parsedCheckIn.getTime()) || isNaN(parsedCheckOut.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format'
      });
    }

    if (parsedCheckOut <= parsedCheckIn) {
      return res.status(400).json({
        error: 'Check-out date must be after check-in date'
      });
    }

    const searchParams: BookingSearchParams = {
      type: 'hotel',
      destination,
      checkIn: parsedCheckIn,
      checkOut: parsedCheckOut,
      guests,
      budget
    };

    const searchFilters: SearchFilters | undefined = filters;

    const results = await bookingSearchService.search(searchParams, searchFilters);

    res.json({
      success: true,
      searchId: results.searchId,
      timestamp: results.timestamp,
      totalProviders: results.totalProviders,
      totalResults: results.totalResults,
      results: results.results,
      filters: results.filters,
      searchParams
    });

  } catch (error) {
    console.error('Hotel search error:', error);
    res.status(500).json({
      error: 'Hotel search failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/booking/{bookingId}/details
 * Get booking details
 */
router.get('/:bookingId/details', requireAuth, async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { provider } = req.query;

    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({
        error: 'Provider name is required as a query parameter'
      });
    }

    const details = await bookingSearchService.getBookingDetails(bookingId, provider);

    res.json({
      success: true,
      bookingId,
      provider,
      details
    });

  } catch (error) {
    console.error('Get booking details error:', error);
    res.status(500).json({
      error: 'Failed to get booking details',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/booking/{bookingId}/confirm
 * Confirm a booking
 */
router.post('/:bookingId/confirm', requireAuth, async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const {
      provider,
      passengerInfo,
      guestInfo,
      contactDetails,
      paymentMethod,
      specialRequests
    } = req.body;

    if (!provider) {
      return res.status(400).json({
        error: 'Provider name is required'
      });
    }

    if (!contactDetails || !paymentMethod) {
      return res.status(400).json({
        error: 'Contact details and payment method are required'
      });
    }

    // For now, return a placeholder response
    // In a real implementation, this would process the booking with the provider
    res.json({
      success: true,
      message: 'Booking confirmation functionality will be implemented in the next phase',
      bookingId,
      provider,
      note: 'Direct booking integration requires additional provider agreements and payment processing setup'
    });

  } catch (error) {
    console.error('Booking confirmation error:', error);
    res.status(500).json({
      error: 'Booking confirmation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/booking/providers/status
 * Get the status of all booking providers
 */
router.get('/providers/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const healthStatus = bookingSearchService.getProviderHealthStatus();
    const providers = bookingSearchService.getProviders();

    const providerStatus = providers.map(provider => ({
      name: provider.name,
      type: provider.type,
      healthy: healthStatus[provider.name]?.healthy || false,
      circuitBreakerState: healthStatus[provider.name]?.circuitBreakerStats?.state || 'UNKNOWN',
      lastChecked: new Date().toISOString()
    }));

    const healthyCount = Object.values(healthStatus).filter(status => status.healthy).length;

    res.json({
      success: true,
      providers: providerStatus,
      healthStatus,
      summary: {
        total: providers.length,
        healthy: healthyCount,
        unhealthy: providers.length - healthyCount
      }
    });

  } catch (error) {
    console.error('Provider status check error:', error);
    res.status(500).json({
      error: 'Failed to check provider status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/booking/providers/health-check
 * Trigger a health check for all providers
 */
router.post('/providers/health-check', requireAuth, async (req: Request, res: Response) => {
  try {
    await bookingSearchService.triggerHealthCheck();

    res.json({
      success: true,
      message: 'Health check completed for all providers',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      error: 'Failed to perform health check',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/booking/circuit-breakers/reset
 * Reset all circuit breakers
 */
router.post('/circuit-breakers/reset', requireAuth, async (req: Request, res: Response) => {
  try {
    bookingSearchService.resetCircuitBreakers();

    res.json({
      success: true,
      message: 'All circuit breakers have been reset',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Circuit breaker reset error:', error);
    res.status(500).json({
      error: 'Failed to reset circuit breakers',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/booking/config
 * Update booking service configuration
 */
router.put('/config', requireAuth, async (req: Request, res: Response) => {
  try {
    const { enableFailover, maxRetries } = req.body;

    if (typeof enableFailover === 'boolean') {
      bookingSearchService.setFailoverEnabled(enableFailover);
    }

    if (typeof maxRetries === 'number') {
      bookingSearchService.setMaxRetries(maxRetries);
    }

    res.json({
      success: true,
      message: 'Booking service configuration updated',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Config update error:', error);
    res.status(500).json({
      error: 'Failed to update configuration',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
