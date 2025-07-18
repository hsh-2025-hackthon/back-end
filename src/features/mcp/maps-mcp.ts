import { BaseMCP, MCPConfig, MCPResponse } from './base-mcp';

export interface Location {
  lat: number;
  lon: number;
}

export interface PlaceData {
  id: string;
  name: string;
  address: string;
  location: Location;
  category: string;
  rating?: number;
  photos?: string[];
  phone?: string;
  website?: string;
  openingHours?: {
    [day: string]: string;
  };
}

export interface RoutePlanRequest {
  waypoints: Location[];
  optimizeOrder?: boolean;
  travelMode?: 'driving' | 'walking' | 'transit' | 'cycling';
}

export interface RoutePlanResponse {
  totalDistance: number;
  totalDuration: number;
  optimizedOrder?: number[];
  legs: {
    startLocation: Location;
    endLocation: Location;
    distance: number;
    duration: number;
    steps: {
      instruction: string;
      distance: number;
      duration: number;
      startLocation: Location;
      endLocation: Location;
    }[];
  }[];
  polyline?: string;
}

export interface PlaceSearchRequest {
  query: string;
  location?: Location;
  radius?: number;
  category?: string;
  limit?: number;
}

export class MapsMCP extends BaseMCP {
  constructor(config: MCPConfig) {
    super(config);
  }

  getServiceName(): string {
    return 'AzureMaps';
  }

  async healthCheck(): Promise<MCPResponse<{ status: string }>> {
    try {
      const response = await this.makeRequest<any>(
        `${this.config.baseUrl}/search/fuzzy/json?api-version=1.0&query=London&subscription-key=${this.config.apiKey}`,
        { method: 'GET' },
        'health-check'
      );

      if (response.success) {
        return {
          success: true,
          data: { status: 'healthy' },
          metadata: {
            timestamp: new Date(),
            source: this.getServiceName(),
          },
        };
      }

      return {
        success: false,
        error: 'Health check failed',
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Health check failed',
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    }
  }

  async searchPlaces(request: PlaceSearchRequest): Promise<MCPResponse<PlaceData[]>> {
    const { query, location, radius = 10000, limit = 10 } = request;
    
    let url = `${this.config.baseUrl}/search/fuzzy/json?api-version=1.0&query=${encodeURIComponent(query)}&limit=${limit}&subscription-key=${this.config.apiKey}`;
    
    if (location) {
      url += `&lat=${location.lat}&lon=${location.lon}&radius=${radius}`;
    }

    const response = await this.makeRequest<any>(url, { method: 'GET' }, `search-${query}`);
    
    if (!response.success) {
      return response;
    }

    const data = response.data;
    
    const places: PlaceData[] = data.results.map((result: any) => ({
      id: result.id || `${result.position.lat}-${result.position.lon}`,
      name: result.poi?.name || result.address?.freeformAddress || 'Unknown',
      address: result.address?.freeformAddress || '',
      location: {
        lat: result.position.lat,
        lon: result.position.lon,
      },
      category: result.poi?.categories?.[0] || 'general',
      rating: result.score || undefined,
      phone: result.poi?.phone || undefined,
      website: result.poi?.url || undefined,
    }));

    return {
      success: true,
      data: places,
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }

  async getPlaceDetails(placeId: string): Promise<MCPResponse<PlaceData>> {
    // Azure Maps doesn't have a direct place details endpoint like Google
    // We'll use the reverse geocoding and POI search to get details
    const url = `${this.config.baseUrl}/search/poi/json?api-version=1.0&query=${encodeURIComponent(placeId)}&subscription-key=${this.config.apiKey}`;
    
    const response = await this.makeRequest<any>(url, { method: 'GET' }, `place-details-${placeId}`);
    
    if (!response.success) {
      return response;
    }

    const data = response.data;
    
    if (!data.results || data.results.length === 0) {
      return {
        success: false,
        error: 'Place not found',
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    }

    const result = data.results[0];
    
    const place: PlaceData = {
      id: result.id || placeId,
      name: result.poi?.name || result.address?.freeformAddress || 'Unknown',
      address: result.address?.freeformAddress || '',
      location: {
        lat: result.position.lat,
        lon: result.position.lon,
      },
      category: result.poi?.categories?.[0] || 'general',
      rating: result.score || undefined,
      phone: result.poi?.phone || undefined,
      website: result.poi?.url || undefined,
    };

    return {
      success: true,
      data: place,
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }

  async planRoute(request: RoutePlanRequest): Promise<MCPResponse<RoutePlanResponse>> {
    const { waypoints, optimizeOrder = false, travelMode = 'driving' } = request;
    
    if (waypoints.length < 2) {
      return {
        success: false,
        error: 'At least 2 waypoints are required',
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    }

    // Convert waypoints to Azure Maps format
    const waypointString = waypoints
      .map(wp => `${wp.lat},${wp.lon}`)
      .join(':');

    let url = `${this.config.baseUrl}/route/directions/json?api-version=1.0&query=${waypointString}&subscription-key=${this.config.apiKey}`;
    
    // Add travel mode
    if (travelMode === 'walking') {
      url += '&travelMode=pedestrian';
    } else if (travelMode === 'cycling') {
      url += '&travelMode=bicycle';
    } else {
      url += '&travelMode=car';
    }

    // Add route optimization if requested
    if (optimizeOrder && waypoints.length > 2) {
      url += '&optimizeWaypoints=true';
    }

    const response = await this.makeRequest<any>(url, { method: 'GET' }, `route-${waypoints.length}-points`);
    
    if (!response.success) {
      return response;
    }

    const data = response.data;
    
    if (!data.routes || data.routes.length === 0) {
      return {
        success: false,
        error: 'No route found',
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    }

    const route = data.routes[0];
    
    const routePlan: RoutePlanResponse = {
      totalDistance: route.summary.lengthInMeters,
      totalDuration: route.summary.travelTimeInSeconds,
      legs: route.legs.map((leg: any) => ({
        startLocation: {
          lat: leg.points[0].latitude,
          lon: leg.points[0].longitude,
        },
        endLocation: {
          lat: leg.points[leg.points.length - 1].latitude,
          lon: leg.points[leg.points.length - 1].longitude,
        },
        distance: leg.summary.lengthInMeters,
        duration: leg.summary.travelTimeInSeconds,
        steps: leg.guidance?.instructions?.map((instruction: any) => ({
          instruction: instruction.message,
          distance: instruction.routeOffsetInMeters || 0,
          duration: 0, // Azure Maps doesn't provide step duration
          startLocation: {
            lat: instruction.point?.latitude || 0,
            lon: instruction.point?.longitude || 0,
          },
          endLocation: {
            lat: instruction.point?.latitude || 0,
            lon: instruction.point?.longitude || 0,
          },
        })) || [],
      })),
    };

    // Add optimized order if available
    if (data.optimizedWaypoints) {
      routePlan.optimizedOrder = data.optimizedWaypoints.map((wp: any) => wp.optimizedIndex);
    }

    return {
      success: true,
      data: routePlan,
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }

  async reverseGeocode(location: Location): Promise<MCPResponse<{ address: string; place: string }>> {
    const url = `${this.config.baseUrl}/search/address/reverse/json?api-version=1.0&query=${location.lat},${location.lon}&subscription-key=${this.config.apiKey}`;
    
    const response = await this.makeRequest<any>(url, { method: 'GET' }, `reverse-${location.lat}-${location.lon}`);
    
    if (!response.success) {
      return response;
    }

    const data = response.data;
    
    if (!data.addresses || data.addresses.length === 0) {
      return {
        success: false,
        error: 'Address not found',
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    }

    const address = data.addresses[0];
    
    return {
      success: true,
      data: {
        address: address.address.freeformAddress,
        place: address.address.municipality || address.address.countrySubdivision || 'Unknown',
      },
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }
}
