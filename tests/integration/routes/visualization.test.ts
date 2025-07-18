import request from 'supertest';
import express from 'express';
import visualizationRouter from '../../../src/api/routes/visualization';
import { TripRepository } from '../../../src/models/trip';
import { VisualizationService } from '../../../src/services/visualization-service';

// Mock dependencies
jest.mock('../../../src/models/trip');
jest.mock('../../../src/services/visualization-service');

const app = express();
app.use(express.json());

// Mock auth middleware
app.use((req, res, next) => {
  req.user = { 
    id: 'user-123', 
    email: 'test@example.com',
    googleId: 'google-123',
    name: 'Test User'
  };
  next();
});

app.use('/api/trips', visualizationRouter);

describe('Visualization Data API Integration Tests', () => {
  const mockTrip = {
    id: 'trip-123',
    title: 'Test Trip',
    description: 'A test trip for visualization',
    owner_id: 'user-123'
  };

  const mockTimelineData = [
    {
      id: 'item-1',
      title: 'Day 1: Arrival',
      start_date: new Date('2025-01-20'),
      end_date: new Date('2025-01-20'),
      type: 'travel',
      location: 'Airport'
    },
    {
      id: 'item-2', 
      title: 'Day 2: Sightseeing',
      start_date: new Date('2025-01-21'),
      end_date: new Date('2025-01-21'),
      type: 'activity',
      location: 'City Center'
    }
  ];

  const mockMapData = {
    destinations: [
      {
        id: 'dest-1',
        name: 'Airport',
        latitude: 40.7128,
        longitude: -74.0060,
        type: 'transportation'
      },
      {
        id: 'dest-2',
        name: 'Hotel',
        latitude: 40.7589,
        longitude: -73.9851,
        type: 'accommodation'
      }
    ],
    routes: [
      {
        from: 'dest-1',
        to: 'dest-2',
        coordinates: [[40.7128, -74.0060], [40.7589, -73.9851]],
        distance: 15.2,
        duration: '25 minutes'
      }
    ]
  };

  const mockSummaryData = {
    totalDays: 7,
    totalDestinations: 5,
    totalActivities: 12,
    totalExpenses: 2500.00,
    budgetUtilization: 0.75,
    collaborators: 3
  };

  const mockTripRepository = TripRepository as jest.Mocked<any>;
  const mockVisualizationService = VisualizationService as jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock implementations
    mockTripRepository.findById = jest.fn().mockResolvedValue(mockTrip);
    mockTripRepository.findUserRoleInTrip = jest.fn().mockResolvedValue('owner');
    
    mockVisualizationService.prototype.getTripTimeline = jest.fn().mockResolvedValue(mockTimelineData);
    mockVisualizationService.prototype.getTripMapData = jest.fn().mockResolvedValue(mockMapData);
    mockVisualizationService.prototype.getTripSummary = jest.fn().mockResolvedValue(mockSummaryData);
  });

  describe('GET /api/trips/:tripId/visualization/timeline', () => {
    it('should get trip timeline successfully', async () => {
      const response = await request(app)
        .get('/api/trips/trip-123/visualization/timeline')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockTimelineData
      });
      expect(mockVisualizationService.prototype.getTripTimeline).toHaveBeenCalledWith('trip-123', {});
    });

    it('should handle date range filtering', async () => {
      const startDate = '2025-01-20';
      const endDate = '2025-01-22';

      const response = await request(app)
        .get(`/api/trips/trip-123/visualization/timeline?start_date=${startDate}&end_date=${endDate}`)
        .expect(200);

      expect(mockVisualizationService.prototype.getTripTimeline).toHaveBeenCalledWith('trip-123', {
        start_date: startDate,
        end_date: endDate
      });
    });

    it('should handle type filtering', async () => {
      const response = await request(app)
        .get('/api/trips/trip-123/visualization/timeline?type=activity')
        .expect(200);

      expect(mockVisualizationService.prototype.getTripTimeline).toHaveBeenCalledWith('trip-123', {
        type: 'activity'
      });
    });

    it('should return 404 for non-existent trip', async () => {
      mockTripRepository.findById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/trips/non-existent/visualization/timeline')
        .expect(404);

      expect(response.body.error).toBe('Trip not found');
    });

    it('should return 403 for unauthorized user', async () => {
      mockTripRepository.findUserRoleInTrip.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/trips/trip-123/visualization/timeline')
        .expect(403);

      expect(response.body.error).toBe('Access denied');
    });
  });

  describe('GET /api/trips/:tripId/visualization/map-data', () => {
    it('should get trip map data successfully', async () => {
      const response = await request(app)
        .get('/api/trips/trip-123/visualization/map-data')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockMapData
      });
      expect(mockVisualizationService.prototype.getTripMapData).toHaveBeenCalledWith('trip-123', {});
    });

    it('should handle bounding box filtering', async () => {
      const bounds = '40.7,-74.1,40.8,-73.9';

      const response = await request(app)
        .get(`/api/trips/trip-123/visualization/map-data?bounds=${bounds}`)
        .expect(200);

      expect(mockVisualizationService.prototype.getTripMapData).toHaveBeenCalledWith('trip-123', {
        bounds: bounds
      });
    });

    it('should handle destination type filtering', async () => {
      const response = await request(app)
        .get('/api/trips/trip-123/visualization/map-data?destination_type=accommodation')
        .expect(200);

      expect(mockVisualizationService.prototype.getTripMapData).toHaveBeenCalledWith('trip-123', {
        destination_type: 'accommodation'
      });
    });

    it('should include routes when requested', async () => {
      const response = await request(app)
        .get('/api/trips/trip-123/visualization/map-data?include_routes=true')
        .expect(200);

      expect(mockVisualizationService.prototype.getTripMapData).toHaveBeenCalledWith('trip-123', {
        include_routes: 'true'
      });
    });
  });

  describe('GET /api/trips/:tripId/visualization/summary', () => {
    it('should get trip summary successfully', async () => {
      const response = await request(app)
        .get('/api/trips/trip-123/visualization/summary')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockSummaryData
      });
      expect(mockVisualizationService.prototype.getTripSummary).toHaveBeenCalledWith('trip-123');
    });

    it('should return 404 for non-existent trip', async () => {
      mockTripRepository.findById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/trips/non-existent/visualization/summary')
        .expect(404);

      expect(response.body.error).toBe('Trip not found');
    });

    it('should return 403 for unauthorized user', async () => {
      mockTripRepository.findUserRoleInTrip.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/trips/trip-123/visualization/summary')
        .expect(403);

      expect(response.body.error).toBe('Access denied');
    });
  });

  describe('Error handling', () => {
    it('should handle visualization service errors', async () => {
      mockVisualizationService.prototype.getTripTimeline.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/trips/trip-123/visualization/timeline')
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
    });

    it('should handle invalid trip ID format', async () => {
      const response = await request(app)
        .get('/api/trips/invalid-id-format/visualization/timeline')
        .expect(400);

      expect(response.body.error).toContain('Invalid trip ID');
    });

    it('should handle invalid date format', async () => {
      const response = await request(app)
        .get('/api/trips/trip-123/visualization/timeline?start_date=invalid-date')
        .expect(400);

      expect(response.body.error).toContain('Invalid date format');
    });

    it('should handle invalid bounds format', async () => {
      const response = await request(app)
        .get('/api/trips/trip-123/visualization/map-data?bounds=invalid-bounds')
        .expect(400);

      expect(response.body.error).toContain('Invalid bounds format');
    });
  });

  describe('Query parameter validation', () => {
    it('should validate timeline type parameter', async () => {
      const response = await request(app)
        .get('/api/trips/trip-123/visualization/timeline?type=invalid-type')
        .expect(400);

      expect(response.body.error).toContain('Invalid type');
    });

    it('should validate destination type parameter', async () => {
      const response = await request(app)
        .get('/api/trips/trip-123/visualization/map-data?destination_type=invalid-type')
        .expect(400);

      expect(response.body.error).toContain('Invalid destination type');
    });

    it('should validate boolean parameters', async () => {
      const response = await request(app)
        .get('/api/trips/trip-123/visualization/map-data?include_routes=invalid-boolean')
        .expect(400);

      expect(response.body.error).toContain('Invalid boolean value');
    });
  });
});
