import { Router } from 'express';
import { mcpManager } from '../../features/mcp/mcp-manager';
import { requireAuth } from '../middleware/auth';
import { MCPResponse } from '../../features/mcp/base-mcp';

const router = Router();

// Apply authentication middleware to all MCP routes
router.use(requireAuth);

// Health check for all MCP services
router.get('/health', async (req, res) => {
  try {
    const health = await mcpManager.getServiceHealth();
    const allHealthy = Object.values(health).every((h: MCPResponse<{ status: string }>) => h.success);
    
    res.status(allHealthy ? 200 : 503).json({
      success: allHealthy,
      services: health,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('[MCP] Health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      timestamp: new Date(),
    });
  }
});

// Weather endpoints
router.get('/weather', async (req, res) => {
  try {
    const weatherService = mcpManager.getService('weather');
    if (!weatherService) {
      return res.status(503).json({
        success: false,
        error: 'Weather service not available',
      });
    }

    const { lat, lon, city, units = 'metric', forecast = false } = req.query;

    if (city) {
      const result = await weatherService.getWeatherByCity(
        city as string,
        units as 'metric' | 'imperial' | 'kelvin'
      );
      return res.json(result);
    }

    if (lat && lon) {
      const result = await weatherService.getCurrentWeather({
        lat: parseFloat(lat as string),
        lon: parseFloat(lon as string),
        units: units as 'metric' | 'imperial' | 'kelvin',
        includeForecast: forecast === 'true',
        days: forecast === 'true' ? 5 : undefined,
      });
      return res.json(result);
    }

    res.status(400).json({
      success: false,
      error: 'Either city or lat/lon coordinates are required',
    });
  } catch (error) {
    console.error('[MCP] Weather request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Weather request failed',
    });
  }
});

// Exchange rates endpoints
router.get('/exchange-rates', async (req, res) => {
  try {
    const exchangeService = mcpManager.getService('exchangeRate');
    if (!exchangeService) {
      return res.status(503).json({
        success: false,
        error: 'Exchange rate service not available',
      });
    }

    const { from, to, amount, historical = false, days = 7 } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: 'Both from and to currency codes are required',
      });
    }

    if (amount) {
      const result = await exchangeService.convertCurrency(
        from as string,
        to as string,
        parseFloat(amount as string)
      );
      return res.json(result);
    }

    const result = await exchangeService.getExchangeRate({
      from: from as string,
      to: to as string,
      historical: historical === 'true',
      days: parseInt(days as string) || 7,
    });

    res.json(result);
  } catch (error) {
    console.error('[MCP] Exchange rate request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Exchange rate request failed',
    });
  }
});

router.get('/exchange-rates/currencies', async (req, res) => {
  try {
    const exchangeService = mcpManager.getService('exchangeRate');
    if (!exchangeService) {
      return res.status(503).json({
        success: false,
        error: 'Exchange rate service not available',
      });
    }

    const result = await exchangeService.getSupportedCurrencies();
    res.json(result);
  } catch (error) {
    console.error('[MCP] Currency list request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Currency list request failed',
    });
  }
});

// Places search endpoints
router.get('/places/search', async (req, res) => {
  try {
    const mapsService = mcpManager.getService('maps');
    if (!mapsService) {
      return res.status(503).json({
        success: false,
        error: 'Maps service not available',
      });
    }

    const { query, lat, lon, radius = 10000, category, limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
    }

    const searchRequest = {
      query: query as string,
      location: lat && lon ? {
        lat: parseFloat(lat as string),
        lon: parseFloat(lon as string),
      } : undefined,
      radius: parseInt(radius as string),
      category: category as string,
      limit: parseInt(limit as string),
    };

    const result = await mapsService.searchPlaces(searchRequest);
    res.json(result);
  } catch (error) {
    console.error('[MCP] Places search failed:', error);
    res.status(500).json({
      success: false,
      error: 'Places search failed',
    });
  }
});

router.get('/places/:placeId/details', async (req, res) => {
  try {
    const mapsService = mcpManager.getService('maps');
    if (!mapsService) {
      return res.status(503).json({
        success: false,
        error: 'Maps service not available',
      });
    }

    const { placeId } = req.params;
    const result = await mapsService.getPlaceDetails(placeId);
    res.json(result);
  } catch (error) {
    console.error('[MCP] Place details request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Place details request failed',
    });
  }
});

// Route planning endpoints
router.post('/routes/plan', async (req, res) => {
  try {
    const mapsService = mcpManager.getService('maps');
    if (!mapsService) {
      return res.status(503).json({
        success: false,
        error: 'Maps service not available',
      });
    }

    const { waypoints, optimizeOrder = false, travelMode = 'driving' } = req.body;

    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 waypoints are required',
      });
    }

    const result = await mapsService.planRoute({
      waypoints,
      optimizeOrder,
      travelMode,
    });

    res.json(result);
  } catch (error) {
    console.error('[MCP] Route planning failed:', error);
    res.status(500).json({
      success: false,
      error: 'Route planning failed',
    });
  }
});

// Travel info endpoints
router.get('/travel/recommendations', async (req, res) => {
  try {
    const travelService = mcpManager.getService('travelInfo');
    if (!travelService) {
      return res.status(503).json({
        success: false,
        error: 'Travel info service not available',
      });
    }

    const { lat, lon, radius = 10, category = 'all', limit = 20, minRating = 3.0, priceLevel } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    const request = {
      location: {
        lat: parseFloat(lat as string),
        lon: parseFloat(lon as string),
      },
      radius: parseInt(radius as string),
      category: category as 'attractions' | 'restaurants' | 'hotels' | 'activities' | 'all',
      limit: parseInt(limit as string),
      minRating: parseFloat(minRating as string),
      priceLevel: priceLevel ? parseInt(priceLevel as string) as 1 | 2 | 3 | 4 : undefined,
    };

    const result = await travelService.getRecommendations(request);
    res.json(result);
  } catch (error) {
    console.error('[MCP] Travel recommendations failed:', error);
    res.status(500).json({
      success: false,
      error: 'Travel recommendations failed',
    });
  }
});

router.get('/travel/restaurants', async (req, res) => {
  try {
    const travelService = mcpManager.getService('travelInfo');
    if (!travelService) {
      return res.status(503).json({
        success: false,
        error: 'Travel info service not available',
      });
    }

    const { lat, lon, radius = 5, limit = 10, minRating = 3.5 } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    const request = {
      location: {
        lat: parseFloat(lat as string),
        lon: parseFloat(lon as string),
      },
      radius: parseInt(radius as string),
      category: 'restaurants' as const,
      limit: parseInt(limit as string),
      minRating: parseFloat(minRating as string),
    };

    const result = await travelService.getRestaurantRecommendations(request);
    res.json(result);
  } catch (error) {
    console.error('[MCP] Restaurant recommendations failed:', error);
    res.status(500).json({
      success: false,
      error: 'Restaurant recommendations failed',
    });
  }
});

router.get('/travel/activities', async (req, res) => {
  try {
    const travelService = mcpManager.getService('travelInfo');
    if (!travelService) {
      return res.status(503).json({
        success: false,
        error: 'Travel info service not available',
      });
    }

    const { lat, lon, radius = 10, limit = 15, minRating = 3.0 } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    const request = {
      location: {
        lat: parseFloat(lat as string),
        lon: parseFloat(lon as string),
      },
      radius: parseInt(radius as string),
      category: 'activities' as const,
      limit: parseInt(limit as string),
      minRating: parseFloat(minRating as string),
    };

    const result = await travelService.getActivityRecommendations(request);
    res.json(result);
  } catch (error) {
    console.error('[MCP] Activity recommendations failed:', error);
    res.status(500).json({
      success: false,
      error: 'Activity recommendations failed',
    });
  }
});

router.get('/travel/search', async (req, res) => {
  try {
    const travelService = mcpManager.getService('travelInfo');
    if (!travelService) {
      return res.status(503).json({
        success: false,
        error: 'Travel info service not available',
      });
    }

    const { query, lat, lon } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
    }

    const location = lat && lon ? {
      lat: parseFloat(lat as string),
      lon: parseFloat(lon as string),
    } : undefined;

    const result = await travelService.searchAttractions(query as string, location);
    res.json(result);
  } catch (error) {
    console.error('[MCP] Travel search failed:', error);
    res.status(500).json({
      success: false,
      error: 'Travel search failed',
    });
  }
});

router.get('/travel/attractions/:id', async (req, res) => {
  try {
    const travelService = mcpManager.getService('travelInfo');
    if (!travelService) {
      return res.status(503).json({
        success: false,
        error: 'Travel info service not available',
      });
    }

    const { id } = req.params;
    const result = await travelService.getAttractionDetails(id);
    res.json(result);
  } catch (error) {
    console.error('[MCP] Attraction details failed:', error);
    res.status(500).json({
      success: false,
      error: 'Attraction details failed',
    });
  }
});

export default router;
