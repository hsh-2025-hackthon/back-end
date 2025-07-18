import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { TripRepository } from '../../models/trip';
import { VisualizationService } from '../../services/visualization-service';

const router = Router();

/**
 * Get timeline data for a trip
 * Returns data formatted for timeline or Gantt chart visualization
 */
router.get('/trips/:tripId/timeline', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;

    // Verify user has access to this trip
    const hasAccess = await TripRepository.checkTripAccess(tripId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    const timelineData = await VisualizationService.getTripTimeline(tripId);

    res.json({
      success: true,
      timeline: timelineData,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Trip not found') {
      return res.status(404).json({ message: 'Trip not found' });
    }

    console.error('Error getting trip timeline:', error);
    res.status(500).json({ 
      message: 'Failed to get trip timeline',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get map data for a trip
 * Returns geographical data for rendering on a map
 */
router.get('/trips/:tripId/map-data', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;
    const includeRoutes = req.query.includeRoutes !== 'false'; // default true
    const layerFilter = req.query.layers as string; // comma-separated list of layers to include

    // Verify user has access to this trip
    const hasAccess = await TripRepository.checkTripAccess(tripId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    const mapData = await VisualizationService.getTripMapData(tripId);

    // Filter routes if requested
    if (!includeRoutes) {
      mapData.routes = [];
    }

    // Filter layers if requested
    if (layerFilter) {
      const requestedLayers = layerFilter.split(',').map(l => l.trim());
      const filteredLayers: any = {};
      
      Object.keys(mapData.layers).forEach(layerKey => {
        if (requestedLayers.includes(layerKey)) {
          filteredLayers[layerKey] = mapData.layers[layerKey as keyof typeof mapData.layers];
        } else {
          filteredLayers[layerKey] = [];
        }
      });
      
      mapData.layers = filteredLayers;
      
      // Also filter main points array
      if (requestedLayers.length > 0) {
        mapData.points = mapData.points.filter(point => 
          requestedLayers.includes(point.type)
        );
      }
    }

    res.json({
      success: true,
      mapData,
      options: {
        includeRoutes,
        layerFilter: layerFilter || 'all'
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Trip not found') {
      return res.status(404).json({ message: 'Trip not found' });
    }

    console.error('Error getting trip map data:', error);
    res.status(500).json({ 
      message: 'Failed to get trip map data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get visualization summary for a trip
 * Returns high-level stats and metadata for dashboard views
 */
router.get('/trips/:tripId/visualization/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;

    // Verify user has access to this trip
    const hasAccess = await TripRepository.checkTripAccess(tripId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    // Get both timeline and map data for comprehensive summary
    const [timelineData, mapData] = await Promise.all([
      VisualizationService.getTripTimeline(tripId),
      VisualizationService.getTripMapData(tripId)
    ]);

    const summary = {
      tripId,
      title: timelineData.title,
      duration: {
        startDate: timelineData.startDate,
        endDate: timelineData.endDate,
        totalHours: timelineData.totalDuration,
        totalDays: timelineData.timeline.days.length
      },
      timeline: {
        totalEvents: timelineData.statistics.totalEvents,
        eventsByType: timelineData.statistics.eventsByType,
        averageEventsPerDay: Math.round(timelineData.statistics.totalEvents / timelineData.timeline.days.length * 10) / 10,
        busyDays: timelineData.timeline.days
          .filter(day => day.events.length > 3)
          .map(day => ({ date: day.date, eventCount: day.events.length }))
      },
      map: {
        totalPoints: mapData.statistics.totalPoints,
        totalRoutes: mapData.statistics.totalRoutes,
        pointsByType: mapData.statistics.pointsByType,
        bounds: mapData.bounds,
        center: mapData.center,
        totalDistance: mapData.statistics.totalDistance,
        estimatedTravelTime: mapData.statistics.estimatedTravelTime
      },
      costs: {
        totalEstimated: timelineData.statistics.totalCost,
        currency: timelineData.statistics.currency,
        hasEstimates: (timelineData.statistics.totalCost || 0) > 0
      },
      dataQuality: {
        timelineCompleteness: timelineData.events.filter(e => e.endTime).length / Math.max(timelineData.events.length, 1),
        locationAccuracy: mapData.points.filter(p => p.latitude && p.longitude).length / Math.max(mapData.points.length, 1),
        hasDetailedItinerary: timelineData.events.length > 0,
        hasMapData: mapData.points.length > 0
      }
    };

    res.json({
      success: true,
      summary,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Trip not found') {
      return res.status(404).json({ message: 'Trip not found' });
    }

    console.error('Error getting visualization summary:', error);
    res.status(500).json({ 
      message: 'Failed to get visualization summary',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get timeline data for a specific day
 * Returns detailed timeline data for a single day
 */
router.get('/trips/:tripId/timeline/day/:dayNumber', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId, dayNumber } = req.params;
    const userId = req.user!.id;
    const dayNum = parseInt(dayNumber);

    if (isNaN(dayNum) || dayNum < 1) {
      return res.status(400).json({ message: 'Invalid day number' });
    }

    // Verify user has access to this trip
    const hasAccess = await TripRepository.checkTripAccess(tripId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    const timelineData = await VisualizationService.getTripTimeline(tripId);
    const dayData = timelineData.timeline.days.find(day => day.dayNumber === dayNum);

    if (!dayData) {
      return res.status(404).json({ message: `Day ${dayNum} not found in trip timeline` });
    }

    res.json({
      success: true,
      day: dayData,
      tripInfo: {
        tripId,
        title: timelineData.title,
        totalDays: timelineData.timeline.days.length
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Trip not found') {
      return res.status(404).json({ message: 'Trip not found' });
    }

    console.error('Error getting day timeline:', error);
    res.status(500).json({ 
      message: 'Failed to get day timeline',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get map data filtered by location bounds
 * Returns map data within specified geographical bounds
 */
router.get('/trips/:tripId/map-data/bounded', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;
    
    // Parse bounds from query parameters
    const neLat = parseFloat(req.query.neLat as string);
    const neLng = parseFloat(req.query.neLng as string);
    const swLat = parseFloat(req.query.swLat as string);
    const swLng = parseFloat(req.query.swLng as string);

    if (isNaN(neLat) || isNaN(neLng) || isNaN(swLat) || isNaN(swLng)) {
      return res.status(400).json({ 
        message: 'Invalid bounds parameters. Required: neLat, neLng, swLat, swLng' 
      });
    }

    // Verify user has access to this trip
    const hasAccess = await TripRepository.checkTripAccess(tripId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    const mapData = await VisualizationService.getTripMapData(tripId);

    // Filter points within bounds
    const filteredPoints = mapData.points.filter(point => {
      return point.latitude >= swLat && 
             point.latitude <= neLat && 
             point.longitude >= swLng && 
             point.longitude <= neLng;
    });

    // Filter routes that have both endpoints within bounds
    const filteredRoutes = mapData.routes.filter(route => {
      const fromPoint = mapData.points.find(p => p.id === route.fromPoint);
      const toPoint = mapData.points.find(p => p.id === route.toPoint);
      
      if (!fromPoint || !toPoint) return false;
      
      const fromInBounds = fromPoint.latitude >= swLat && fromPoint.latitude <= neLat && 
                           fromPoint.longitude >= swLng && fromPoint.longitude <= neLng;
      const toInBounds = toPoint.latitude >= swLat && toPoint.latitude <= neLat && 
                         toPoint.longitude >= swLng && toPoint.longitude <= neLng;
      
      return fromInBounds && toInBounds;
    });

    // Update layers with filtered points
    const filteredLayers: any = {};
    Object.keys(mapData.layers).forEach(layerKey => {
      filteredLayers[layerKey] = mapData.layers[layerKey as keyof typeof mapData.layers]
        .filter((point: any) => filteredPoints.some(fp => fp.id === point.id));
    });

    const result = {
      ...mapData,
      points: filteredPoints,
      routes: filteredRoutes,
      layers: filteredLayers,
      statistics: {
        ...mapData.statistics,
        totalPoints: filteredPoints.length,
        totalRoutes: filteredRoutes.length,
        pointsByType: filteredPoints.reduce((acc, point) => {
          acc[point.type] = (acc[point.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      }
    };

    res.json({
      success: true,
      mapData: result,
      bounds: {
        northeast: { latitude: neLat, longitude: neLng },
        southwest: { latitude: swLat, longitude: swLng }
      },
      originalStats: {
        totalPoints: mapData.statistics.totalPoints,
        filteredPoints: filteredPoints.length
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Trip not found') {
      return res.status(404).json({ message: 'Trip not found' });
    }

    console.error('Error getting bounded map data:', error);
    res.status(500).json({ 
      message: 'Failed to get bounded map data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
