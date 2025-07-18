import { BaseMCP, MCPConfig, MCPResponse } from './base-mcp';

export interface TravelAttraction {
  id: string;
  name: string;
  description: string;
  location: {
    lat: number;
    lon: number;
    address: string;
    city: string;
    country: string;
  };
  category: string;
  rating: number;
  reviewCount: number;
  photos: string[];
  priceLevel?: 1 | 2 | 3 | 4; // 1 = $, 2 = $$, 3 = $$$, 4 = $$$$
  openingHours?: {
    [day: string]: string;
  };
  website?: string;
  phone?: string;
  tags: string[];
}

export interface TravelRecommendationRequest {
  location: {
    lat: number;
    lon: number;
  };
  radius?: number; // in kilometers
  category?: 'attractions' | 'restaurants' | 'hotels' | 'activities' | 'all';
  priceLevel?: 1 | 2 | 3 | 4;
  limit?: number;
  minRating?: number;
}

export interface RestaurantInfo extends TravelAttraction {
  cuisine: string[];
  averagePrice: number;
  dietaryOptions: string[];
  reservationsRequired: boolean;
}

export interface ActivityInfo extends TravelAttraction {
  duration: string;
  difficulty?: 'easy' | 'moderate' | 'difficult';
  ageRestrictions?: string;
  seasonality?: string[];
  bookingRequired: boolean;
}

export class TravelInfoMCP extends BaseMCP {
  constructor(config: MCPConfig) {
    super(config);
  }

  getServiceName(): string {
    return 'TravelInfoAPI';
  }

  async healthCheck(): Promise<MCPResponse<{ status: string }>> {
    try {
      // Use a simple location search as health check
      const response = await this.makeRequest<any>(
        `${this.config.baseUrl}/partner/2.0/location/search?key=${this.config.apiKey}&searchQuery=London&category=attractions`,
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

  async getRecommendations(request: TravelRecommendationRequest): Promise<MCPResponse<TravelAttraction[]>> {
    const { location, radius = 10, category = 'all', limit = 20, minRating = 3.0 } = request;
    
    let url = `${this.config.baseUrl}/partner/2.0/location/nearby_search?key=${this.config.apiKey}`;
    url += `&latLong=${location.lat},${location.lon}`;
    url += `&radius=${radius}`;
    url += `&limit=${limit}`;
    
    if (category !== 'all') {
      url += `&category=${category}`;
    }

    const response = await this.makeRequest<any>(url, { method: 'GET' }, `recommendations-${location.lat}-${location.lon}-${category}`);
    
    if (!response.success) {
      return response;
    }

    const data = response.data;
    
    if (!data.data || data.data.length === 0) {
      return {
        success: true,
        data: [],
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    }

    const attractions: TravelAttraction[] = data.data
      .filter((item: any) => !minRating || (item.rating && item.rating >= minRating))
      .map((item: any) => this.mapToTravelAttraction(item));

    return {
      success: true,
      data: attractions,
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }

  async getAttractionDetails(attractionId: string): Promise<MCPResponse<TravelAttraction>> {
    const url = `${this.config.baseUrl}/partner/2.0/location/${attractionId}/details?key=${this.config.apiKey}`;
    
    const response = await this.makeRequest<any>(url, { method: 'GET' }, `attraction-details-${attractionId}`);
    
    if (!response.success) {
      return response;
    }

    const data = response.data;
    
    if (!data.data) {
      return {
        success: false,
        error: 'Attraction not found',
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    }

    const attraction = this.mapToTravelAttraction(data.data);

    return {
      success: true,
      data: attraction,
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }

  async searchAttractions(query: string, location?: { lat: number; lon: number }): Promise<MCPResponse<TravelAttraction[]>> {
    let url = `${this.config.baseUrl}/partner/2.0/location/search?key=${this.config.apiKey}&searchQuery=${encodeURIComponent(query)}`;
    
    if (location) {
      url += `&latLong=${location.lat},${location.lon}`;
    }

    const response = await this.makeRequest<any>(url, { method: 'GET' }, `search-${query}`);
    
    if (!response.success) {
      return response;
    }

    const data = response.data;
    
    if (!data.data || data.data.length === 0) {
      return {
        success: true,
        data: [],
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    }

    const attractions: TravelAttraction[] = data.data.map((item: any) => this.mapToTravelAttraction(item));

    return {
      success: true,
      data: attractions,
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }

  async getRestaurantRecommendations(request: TravelRecommendationRequest): Promise<MCPResponse<RestaurantInfo[]>> {
    const restaurantRequest = { ...request, category: 'restaurants' as const };
    const response = await this.getRecommendations(restaurantRequest);
    
    if (!response.success) {
      return response as MCPResponse<RestaurantInfo[]>;
    }

    const restaurants: RestaurantInfo[] = response.data!.map(attraction => ({
      ...attraction,
      cuisine: this.extractCuisineFromTags(attraction.tags),
      averagePrice: this.estimatePriceFromLevel(attraction.priceLevel),
      dietaryOptions: this.extractDietaryOptions(attraction.tags),
      reservationsRequired: this.estimateReservationRequirement(attraction.rating, attraction.priceLevel),
    }));

    return {
      success: true,
      data: restaurants,
      metadata: response.metadata,
    };
  }

  async getActivityRecommendations(request: TravelRecommendationRequest): Promise<MCPResponse<ActivityInfo[]>> {
    const activityRequest = { ...request, category: 'activities' as const };
    const response = await this.getRecommendations(activityRequest);
    
    if (!response.success) {
      return response as MCPResponse<ActivityInfo[]>;
    }

    const activities: ActivityInfo[] = response.data!.map(attraction => ({
      ...attraction,
      duration: this.estimateDuration(attraction.category, attraction.tags),
      difficulty: this.estimateDifficulty(attraction.category, attraction.tags),
      ageRestrictions: this.extractAgeRestrictions(attraction.tags),
      seasonality: this.extractSeasonality(attraction.tags),
      bookingRequired: this.estimateBookingRequirement(attraction.category, attraction.rating),
    }));

    return {
      success: true,
      data: activities,
      metadata: response.metadata,
    };
  }

  private mapToTravelAttraction(item: any): TravelAttraction {
    return {
      id: item.location_id || item.id || '',
      name: item.name || 'Unknown',
      description: item.description || item.snippet || '',
      location: {
        lat: parseFloat(item.latitude) || 0,
        lon: parseFloat(item.longitude) || 0,
        address: item.address || '',
        city: item.address_obj?.city || '',
        country: item.address_obj?.country || '',
      },
      category: item.subcategory?.[0]?.name || item.category?.name || 'general',
      rating: parseFloat(item.rating) || 0,
      reviewCount: parseInt(item.num_reviews) || 0,
      photos: item.photo?.images ? [item.photo.images.original?.url || item.photo.images.large?.url] : [],
      priceLevel: this.mapPriceLevel(item.price_level),
      website: item.website || undefined,
      phone: item.phone || undefined,
      tags: this.extractTags(item),
    };
  }

  private mapPriceLevel(priceLevel: string): 1 | 2 | 3 | 4 | undefined {
    if (!priceLevel) return undefined;
    
    switch (priceLevel.toLowerCase()) {
      case '$':
      case 'inexpensive':
        return 1;
      case '$$':
      case 'moderate':
        return 2;
      case '$$$':
      case 'expensive':
        return 3;
      case '$$$$':
      case 'very expensive':
        return 4;
      default:
        return undefined;
    }
  }

  private extractTags(item: any): string[] {
    const tags: string[] = [];
    
    if (item.subcategory) {
      tags.push(...item.subcategory.map((cat: any) => cat.name));
    }
    
    if (item.category) {
      tags.push(item.category.name);
    }
    
    if (item.dietary_restrictions) {
      tags.push(...item.dietary_restrictions.map((diet: any) => diet.name));
    }
    
    return tags.filter(Boolean);
  }

  private extractCuisineFromTags(tags: string[]): string[] {
    const cuisineKeywords = ['italian', 'chinese', 'japanese', 'french', 'mexican', 'indian', 'thai', 'american', 'mediterranean'];
    return tags.filter(tag => cuisineKeywords.some(cuisine => tag.toLowerCase().includes(cuisine)));
  }

  private extractDietaryOptions(tags: string[]): string[] {
    const dietaryKeywords = ['vegetarian', 'vegan', 'gluten-free', 'halal', 'kosher'];
    return tags.filter(tag => dietaryKeywords.some(diet => tag.toLowerCase().includes(diet)));
  }

  private estimatePriceFromLevel(priceLevel?: 1 | 2 | 3 | 4): number {
    switch (priceLevel) {
      case 1: return 15;
      case 2: return 30;
      case 3: return 60;
      case 4: return 100;
      default: return 25;
    }
  }

  private estimateReservationRequirement(rating: number, priceLevel?: 1 | 2 | 3 | 4): boolean {
    return rating > 4.0 || (priceLevel ? priceLevel >= 3 : false);
  }

  private estimateDuration(category: string, tags: string[]): string {
    const shortActivities = ['shopping', 'market', 'viewpoint'];
    const longActivities = ['museum', 'park', 'tour', 'hike'];
    
    if (shortActivities.some(act => category.toLowerCase().includes(act) || tags.some(tag => tag.toLowerCase().includes(act)))) {
      return '1-2 hours';
    }
    
    if (longActivities.some(act => category.toLowerCase().includes(act) || tags.some(tag => tag.toLowerCase().includes(act)))) {
      return '3-4 hours';
    }
    
    return '2-3 hours';
  }

  private estimateDifficulty(category: string, tags: string[]): 'easy' | 'moderate' | 'difficult' | undefined {
    const easyActivities = ['museum', 'shopping', 'restaurant'];
    const difficultActivities = ['hike', 'climbing', 'adventure'];
    
    if (easyActivities.some(act => category.toLowerCase().includes(act) || tags.some(tag => tag.toLowerCase().includes(act)))) {
      return 'easy';
    }
    
    if (difficultActivities.some(act => category.toLowerCase().includes(act) || tags.some(tag => tag.toLowerCase().includes(act)))) {
      return 'difficult';
    }
    
    return 'moderate';
  }

  private extractAgeRestrictions(tags: string[]): string | undefined {
    const ageKeywords = ['adult', '18+', 'children', 'family'];
    const ageTag = tags.find(tag => ageKeywords.some(keyword => tag.toLowerCase().includes(keyword)));
    return ageTag || undefined;
  }

  private extractSeasonality(tags: string[]): string[] {
    const seasonKeywords = ['summer', 'winter', 'spring', 'autumn', 'fall'];
    return tags.filter(tag => seasonKeywords.some(season => tag.toLowerCase().includes(season)));
  }

  private estimateBookingRequirement(category: string, rating: number): boolean {
    const bookingRequired = ['tour', 'show', 'event', 'experience'];
    return rating > 4.0 || bookingRequired.some(req => category.toLowerCase().includes(req));
  }
}
