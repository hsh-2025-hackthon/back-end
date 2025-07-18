import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { TripRepository } from '../../models/trip';
import { MCPManager } from '../../features/mcp/mcp-manager';
import { ExpenseRepository } from '../../models/expense';
import { VoteRepository } from '../../models/vote';
import { generateItinerary } from '../../lib/openai';

const router = Router();
const mcpManager = new MCPManager();

// Middleware to verify trip access
const verifyTripAccess = async (req: Request, res: Response, next: any) => {
  try {
    const { tripId } = req.params;
    const userId = (req as any).user.id;
    
    // Check if user has access to this trip
    const hasAccess = await TripRepository.checkTripAccess(tripId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Trip not found or access denied' });
    }
    
    // Get trip with destinations
    const trip = await TripRepository.findByIdWithDestinations(tripId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    (req as any).trip = trip;
    next();
  } catch (error) {
    console.error('Error verifying trip access:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/trips/{tripId}/quick-actions/suggest-itinerary
 * Trigger AI to suggest an itinerary
 */
router.post('/:tripId/quick-actions/suggest-itinerary', requireAuth, verifyTripAccess, async (req: Request, res: Response) => {
  try {
    const trip = (req as any).trip;
    const { preferences, days } = req.body;

    // Generate AI itinerary based on trip destinations and preferences
    const destination = trip.destinations?.map((d: any) => d.name).join(', ') || 'the destination';
    const duration = days || 3;

    const suggestedItinerary = await generateItinerary(destination, duration);

    res.json({
      success: true,
      tripId: trip.id,
      suggestedItinerary,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating itinerary suggestion:', error);
    res.status(500).json({ error: 'Failed to generate itinerary suggestion' });
  }
});

/**
 * POST /api/trips/{tripId}/quick-actions/add-destination
 * Quickly add a destination to the trip itinerary
 */
router.post('/:tripId/quick-actions/add-destination', requireAuth, verifyTripAccess, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const { name, description, latitude, longitude, country, city } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Destination name is required' });
    }

    // Add destination to trip
    const newDestination = await TripRepository.addDestination(tripId, {
      name,
      description,
      latitude,
      longitude,
      country,
      city
    });

    res.status(201).json({
      success: true,
      message: 'Destination added successfully',
      destination: newDestination
    });
  } catch (error) {
    console.error('Error adding destination:', error);
    res.status(500).json({ error: 'Failed to add destination' });
  }
});

/**
 * POST /api/trips/{tripId}/quick-actions/get-weather
 * Get current weather for the trip's destination
 */
router.post('/:tripId/quick-actions/get-weather', requireAuth, verifyTripAccess, async (req: Request, res: Response) => {
  try {
    const trip = (req as any).trip;
    const { date } = req.body; // Optional specific date

    if (!trip.destinations || trip.destinations.length === 0) {
      return res.status(400).json({ error: 'No destinations found for this trip' });
    }

    const weatherData = [];
    
    // Get weather for each destination
    for (const destination of trip.destinations) {
      if (destination.latitude && destination.longitude) {
        try {
          const weather = await mcpManager.getService('weather')?.getCurrentWeather({
            lat: destination.latitude,
            lon: destination.longitude,
            units: 'metric'
          });

          if (weather?.success) {
            weatherData.push({
              destination: destination.name,
              weather: weather.data,
              coordinates: {
                latitude: destination.latitude,
                longitude: destination.longitude
              }
            });
          }
        } catch (weatherError) {
          console.error(`Weather fetch error for ${destination.name}:`, weatherError);
          weatherData.push({
            destination: destination.name,
            error: 'Weather data unavailable',
            coordinates: {
              latitude: destination.latitude,
              longitude: destination.longitude
            }
          });
        }
      } else {
        weatherData.push({
          destination: destination.name,
          error: 'No coordinates available for weather lookup'
        });
      }
    }

    res.json({
      success: true,
      tripId: trip.id,
      weatherData,
      retrievedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching weather data:', error);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

/**
 * POST /api/trips/{tripId}/quick-actions/split-expense
 * Initiate an expense split for a trip
 */
router.post('/:tripId/quick-actions/split-expense', requireAuth, verifyTripAccess, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = (req as any).user.id;
    const { amount, title, description, category, currency, splitMethod = 'equal', participants } = req.body;

    if (!amount || !title) {
      return res.status(400).json({ error: 'Amount and title are required' });
    }

    // Create the expense
    const expense = await ExpenseRepository.createExpense({
      tripId,
      userId,
      payerId: userId,
      title,
      description,
      amount,
      currency: currency || 'USD',
      category: category || 'general',
      expenseDate: new Date(),
      participants: participants || [],
      splitMethod,
      splitData: {},
      receiptUrls: []
    });

    res.status(201).json({
      success: true,
      message: 'Expense created and split initiated',
      expense
    });
  } catch (error) {
    console.error('Error creating expense split:', error);
    res.status(500).json({ error: 'Failed to create expense split' });
  }
});

/**
 * POST /api/trips/{tripId}/quick-actions/create-vote
 * Quickly create a new vote in the trip's chat
 */
router.post('/:tripId/quick-actions/create-vote', requireAuth, verifyTripAccess, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = (req as any).user.id;
    const { title, description, options, deadline, voteType = 'single' } = req.body;

    if (!title || !options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ 
        error: 'Title and at least 2 options are required' 
      });
    }

    // Convert options to the required format
    const formattedOptions = options.map((option: any, index: number) => ({
      name: typeof option === 'string' ? option : option.name || option.text,
      description: typeof option === 'object' ? option.description : undefined
    }));

    const vote = await VoteRepository.createVote({
      tripId,
      creatorId: userId,
      title,
      description,
      voteType,
      options: formattedOptions,
      deadline: deadline ? new Date(deadline) : undefined
    });

    res.status(201).json({
      success: true,
      message: 'Vote created successfully',
      vote
    });
  } catch (error) {
    console.error('Error creating vote:', error);
    res.status(500).json({ error: 'Failed to create vote' });
  }
});

/**
 * POST /api/trips/{tripId}/quick-actions/export-itinerary
 * Trigger the export of the trip itinerary
 */
router.post('/:tripId/quick-actions/export-itinerary', requireAuth, verifyTripAccess, async (req: Request, res: Response) => {
  try {
    const trip = (req as any).trip;
    const { format = 'pdf' } = req.body;

    // For now, return a structured itinerary data
    // TODO: Implement actual PDF generation in a future session
    const itineraryData = {
      trip: {
        id: trip.id,
        title: trip.title,
        description: trip.description,
        startDate: trip.startDate,
        endDate: trip.endDate,
        destinations: trip.destinations
      },
      exportFormat: format,
      exportedAt: new Date().toISOString(),
      downloadUrl: `/api/trips/${trip.id}/export/${format}` // Future implementation
    };

    res.json({
      success: true,
      message: 'Itinerary export prepared',
      itinerary: itineraryData,
      note: 'PDF generation will be implemented in the next phase'
    });
  } catch (error) {
    console.error('Error exporting itinerary:', error);
    res.status(500).json({ error: 'Failed to export itinerary' });
  }
});

export default router;
