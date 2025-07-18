import { getDatabase } from '../config/database';
import { TripRepository } from '../models/trip';
import { MapsMCP } from '../features/mcp/maps-mcp';

export interface TimelineEvent {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  type: 'travel' | 'activity' | 'accommodation' | 'meal' | 'break' | 'other';
  location?: {
    name: string;
    latitude?: number;
    longitude?: number;
    address?: string;
  };
  cost?: number;
  currency?: string;
  status: 'planned' | 'confirmed' | 'completed' | 'cancelled';
  priority: number; // 1-10
  dependencies?: string[]; // IDs of events this depends on
  metadata?: Record<string, any>;
}

export interface TimelineData {
  tripId: string;
  title: string;
  startDate: Date;
  endDate: Date;
  totalDuration: number; // in hours
  events: TimelineEvent[];
  timeline: {
    days: Array<{
      date: Date;
      dayNumber: number;
      events: TimelineEvent[];
      totalDuration: number;
      timeSlots: Array<{
        startTime: string;
        endTime: string;
        event?: TimelineEvent;
        isFree: boolean;
      }>;
    }>;
  };
  statistics: {
    totalEvents: number;
    eventsByType: Record<string, number>;
    totalCost?: number;
    currency?: string;
  };
}

export interface MapPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type: 'destination' | 'accommodation' | 'activity' | 'restaurant' | 'transport' | 'poi';
  address?: string;
  description?: string;
  visitDate?: Date;
  duration?: number; // in minutes
  cost?: number;
  currency?: string;
  rating?: number;
  photos?: string[];
  operatingHours?: {
    [day: string]: { open: string; close: string; closed?: boolean };
  };
  metadata?: Record<string, any>;
}

export interface MapRoute {
  id: string;
  name: string;
  fromPoint: string; // MapPoint ID
  toPoint: string; // MapPoint ID
  type: 'walking' | 'driving' | 'transit' | 'cycling' | 'flight';
  distance?: number; // in meters
  duration?: number; // in minutes
  cost?: number;
  currency?: string;
  polyline?: string; // encoded polyline for route visualization
  waypoints?: Array<{
    latitude: number;
    longitude: number;
    name?: string;
  }>;
  transportDetails?: {
    mode?: string;
    provider?: string;
    schedule?: Date[];
    bookingReference?: string;
  };
}

export interface MapData {
  tripId: string;
  title: string;
  bounds: {
    northeast: { latitude: number; longitude: number };
    southwest: { latitude: number; longitude: number };
  };
  center: {
    latitude: number;
    longitude: number;
  };
  points: MapPoint[];
  routes: MapRoute[];
  layers: {
    destinations: MapPoint[];
    accommodations: MapPoint[];
    activities: MapPoint[];
    restaurants: MapPoint[];
    transport: MapPoint[];
    pois: MapPoint[];
  };
  statistics: {
    totalPoints: number;
    totalRoutes: number;
    totalDistance?: number;
    estimatedTravelTime?: number;
    pointsByType: Record<string, number>;
  };
}

export class VisualizationService {
  /**
   * Get timeline data for a trip - formatted for Gantt chart visualization
   */
  static async getTripTimeline(tripId: string): Promise<TimelineData> {
    const db = getDatabase();
    
    // Get trip basic information
    const trip = await TripRepository.findByIdWithDestinations(tripId);
    if (!trip) {
      throw new Error('Trip not found');
    }

    const startDate = new Date(trip.startDate);
    const endDate = new Date(trip.endDate);
    const totalDuration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));

    // Get itinerary activities from the itinerary system
    const activitiesQuery = `
      SELECT 
        a.id,
        a.name as title,
        a.description,
        a.start_time as "startTime",
        a.end_time as "endTime",
        a.activity_type as type,
        a.location_name as "locationName",
        a.latitude,
        a.longitude,
        a.address,
        a.cost,
        a.currency,
        a.status,
        a.priority,
        a.created_at,
        d.name as "destinationName"
      FROM itinerary_activities a
      LEFT JOIN destinations d ON a.destination_id = d.id
      WHERE a.trip_id = $1
      ORDER BY a.start_time ASC
    `;

    const activitiesResult = await db.query(activitiesQuery, [tripId]);

    // Convert activities to timeline events
    const events: TimelineEvent[] = activitiesResult.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      startTime: new Date(row.startTime),
      endTime: row.endTime ? new Date(row.endTime) : undefined,
      type: this.mapActivityTypeToTimelineType(row.type),
      location: {
        name: row.locationName || row.destinationName,
        latitude: row.latitude,
        longitude: row.longitude,
        address: row.address
      },
      cost: row.cost,
      currency: row.currency,
      status: row.status || 'planned',
      priority: row.priority || 5,
      metadata: {
        destinationName: row.destinationName,
        originalType: row.type
      }
    }));

    // Add destination arrival/departure events
    if (trip.destinations) {
      trip.destinations.forEach((dest, index) => {
        // Add arrival event
        events.push({
          id: `arrival_${dest.id}`,
          title: `Arrive at ${dest.name}`,
          description: `Arrival at ${dest.name}`,
          startTime: new Date(startDate.getTime() + (index * 24 * 60 * 60 * 1000)),
          type: 'travel',
          location: {
            name: dest.name,
            latitude: dest.latitude,
            longitude: dest.longitude
          },
          status: 'planned',
          priority: 8,
          metadata: {
            eventType: 'arrival',
            destinationId: dest.id
          }
        });
      });
    }

    // Generate day-by-day timeline
    const days = [];
    const currentDate = new Date(startDate);
    let dayNumber = 1;

    while (currentDate <= endDate) {
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      const dayEvents = events.filter(event => {
        return event.startTime >= dayStart && event.startTime <= dayEnd;
      });

      const timeSlots = this.generateTimeSlots(dayStart, dayEvents);

      days.push({
        date: new Date(currentDate),
        dayNumber,
        events: dayEvents,
        totalDuration: dayEvents.reduce((total, event) => {
          if (event.endTime) {
            return total + (event.endTime.getTime() - event.startTime.getTime()) / (1000 * 60 * 60);
          }
          return total + 1; // Default 1 hour for events without end time
        }, 0),
        timeSlots
      });

      currentDate.setDate(currentDate.getDate() + 1);
      dayNumber++;
    }

    // Calculate statistics
    const eventsByType = events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalCost = events.reduce((total, event) => {
      return total + (event.cost || 0);
    }, 0);

    return {
      tripId,
      title: trip.title,
      startDate,
      endDate,
      totalDuration,
      events,
      timeline: { days },
      statistics: {
        totalEvents: events.length,
        eventsByType,
        totalCost: totalCost > 0 ? totalCost : undefined,
        currency: trip.currency
      }
    };
  }

  /**
   * Get map data for a trip - formatted for map visualization
   */
  static async getTripMapData(tripId: string): Promise<MapData> {
    const db = getDatabase();
    
    // Get trip with destinations
    const trip = await TripRepository.findByIdWithDestinations(tripId);
    if (!trip) {
      throw new Error('Trip not found');
    }

    const points: MapPoint[] = [];
    const routes: MapRoute[] = [];

    // Add destinations as map points
    if (trip.destinations) {
      for (const dest of trip.destinations) {
        if (dest.latitude && dest.longitude) {
          points.push({
            id: `dest_${dest.id}`,
            name: dest.name,
            latitude: dest.latitude,
            longitude: dest.longitude,
            type: 'destination',
            description: dest.description,
            metadata: {
              destinationId: dest.id,
              orderIndex: dest.orderIndex
            }
          });
        }
      }
    }

    // Get itinerary activities as map points
    const activitiesQuery = `
      SELECT 
        a.id,
        a.name,
        a.latitude,
        a.longitude,
        a.address,
        a.description,
        a.activity_type as type,
        a.start_time as "startTime",
        a.end_time as "endTime",
        a.cost,
        a.currency,
        a.rating,
        a.operating_hours as "operatingHours"
      FROM itinerary_activities a
      WHERE a.trip_id = $1 AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL
      ORDER BY a.start_time ASC
    `;

    const activitiesResult = await db.query(activitiesQuery, [tripId]);

    activitiesResult.rows.forEach(row => {
      points.push({
        id: `activity_${row.id}`,
        name: row.name,
        latitude: row.latitude,
        longitude: row.longitude,
        type: this.mapActivityTypeToMapPointType(row.type),
        address: row.address,
        description: row.description,
        visitDate: row.startTime ? new Date(row.startTime) : undefined,
        duration: row.endTime && row.startTime ? 
          Math.ceil((new Date(row.endTime).getTime() - new Date(row.startTime).getTime()) / (1000 * 60)) : 
          undefined,
        cost: row.cost,
        currency: row.currency,
        rating: row.rating,
        operatingHours: row.operatingHours,
        metadata: {
          activityId: row.id,
          originalType: row.type
        }
      });
    });

    // Generate routes between consecutive destinations
    if (trip.destinations && trip.destinations.length > 1) {
      const sortedDestinations = trip.destinations
        .filter(d => d.latitude && d.longitude)
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

      for (let i = 0; i < sortedDestinations.length - 1; i++) {
        const from = sortedDestinations[i];
        const to = sortedDestinations[i + 1];

        try {
          // Create a basic route without detailed information for now
          // In the future, this could use the Maps MCP to get route information
          routes.push({
            id: `route_${from.id}_${to.id}`,
            name: `${from.name} to ${to.name}`,
            fromPoint: `dest_${from.id}`,
            toPoint: `dest_${to.id}`,
            type: 'driving'
          });
        } catch (error) {
          console.warn(`Failed to get route from ${from.name} to ${to.name}:`, error);
          // Add basic route without detailed information
          routes.push({
            id: `route_${from.id}_${to.id}`,
            name: `${from.name} to ${to.name}`,
            fromPoint: `dest_${from.id}`,
            toPoint: `dest_${to.id}`,
            type: 'driving'
          });
        }
      }
    }

    // Calculate bounds
    const bounds = this.calculateBounds(points);
    const center = this.calculateCenter(points);

    // Group points by type
    const layers = {
      destinations: points.filter(p => p.type === 'destination'),
      accommodations: points.filter(p => p.type === 'accommodation'),
      activities: points.filter(p => p.type === 'activity'),
      restaurants: points.filter(p => p.type === 'restaurant'),
      transport: points.filter(p => p.type === 'transport'),
      pois: points.filter(p => p.type === 'poi')
    };

    // Calculate statistics
    const pointsByType = points.reduce((acc, point) => {
      acc[point.type] = (acc[point.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalDistance = routes.reduce((total, route) => {
      return total + (route.distance || 0);
    }, 0);

    const estimatedTravelTime = routes.reduce((total, route) => {
      return total + (route.duration || 0);
    }, 0);

    return {
      tripId,
      title: trip.title,
      bounds,
      center,
      points,
      routes,
      layers,
      statistics: {
        totalPoints: points.length,
        totalRoutes: routes.length,
        totalDistance: totalDistance > 0 ? totalDistance : undefined,
        estimatedTravelTime: estimatedTravelTime > 0 ? estimatedTravelTime : undefined,
        pointsByType
      }
    };
  }

  // Helper methods
  private static mapActivityTypeToTimelineType(activityType: string): TimelineEvent['type'] {
    const mapping: Record<string, TimelineEvent['type']> = {
      'transportation': 'travel',
      'accommodation': 'accommodation',
      'dining': 'meal',
      'sightseeing': 'activity',
      'entertainment': 'activity',
      'shopping': 'activity',
      'business': 'other',
      'rest': 'break'
    };
    
    return mapping[activityType] || 'activity';
  }

  private static mapActivityTypeToMapPointType(activityType: string): MapPoint['type'] {
    const mapping: Record<string, MapPoint['type']> = {
      'accommodation': 'accommodation',
      'dining': 'restaurant',
      'transportation': 'transport',
      'sightseeing': 'poi',
      'entertainment': 'activity',
      'shopping': 'activity',
      'business': 'poi'
    };
    
    return mapping[activityType] || 'activity';
  }

  private static generateTimeSlots(dayStart: Date, events: TimelineEvent[]) {
    const slots = [];
    const slotDuration = 60; // 1 hour slots
    
    for (let hour = 0; hour < 24; hour++) {
      const slotStart = new Date(dayStart);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(dayStart);
      slotEnd.setHours(hour + 1, 0, 0, 0);
      
      const event = events.find(e => 
        e.startTime >= slotStart && e.startTime < slotEnd
      );
      
      slots.push({
        startTime: slotStart.toTimeString().slice(0, 5),
        endTime: slotEnd.toTimeString().slice(0, 5),
        event,
        isFree: !event
      });
    }
    
    return slots;
  }

  private static calculateBounds(points: MapPoint[]) {
    if (points.length === 0) {
      return {
        northeast: { latitude: 0, longitude: 0 },
        southwest: { latitude: 0, longitude: 0 }
      };
    }

    const lats = points.map(p => p.latitude);
    const lngs = points.map(p => p.longitude);

    return {
      northeast: {
        latitude: Math.max(...lats),
        longitude: Math.max(...lngs)
      },
      southwest: {
        latitude: Math.min(...lats),
        longitude: Math.min(...lngs)
      }
    };
  }

  private static calculateCenter(points: MapPoint[]) {
    if (points.length === 0) {
      return { latitude: 0, longitude: 0 };
    }

    const avgLat = points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
    const avgLng = points.reduce((sum, p) => sum + p.longitude, 0) / points.length;

    return {
      latitude: avgLat,
      longitude: avgLng
    };
  }
}
