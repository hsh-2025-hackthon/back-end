import { MCPManager } from '../mcp/mcp-manager';
import { TripRepository, Trip, Destination } from '../../models/trip';

export interface ItineraryCard {
  id: string;
  tripId: string;
  type: 'destination' | 'activity' | 'transport' | 'accommodation' | 'meal';
  title: string;
  description?: string;
  
  // Basic information
  basicInfo: {
    date: Date;
    startTime?: string;
    endTime?: string;
    duration?: string;
    location?: {
      name: string;
      address?: string;
      coordinates?: {
        lat: number;
        lng: number;
      };
    };
    status: 'planned' | 'confirmed' | 'completed' | 'cancelled';
  };
  
  // Real-time enriched data
  enrichedData: {
    weather?: WeatherCardData;
    pricing?: PricingCardData;
    transport?: TransportCardData;
    crowding?: CrowdingCardData;
    reviews?: ReviewsCardData;
    operatingHours?: OperatingHoursCardData;
    lastUpdated: Date;
  };
  
  // Actions available on this card
  actions: ItineraryCardAction[];
  
  // Metadata
  metadata: {
    priority: 'low' | 'medium' | 'high';
    tags: string[];
    notes?: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface WeatherCardData {
  current: {
    temperature: number;
    condition: string;
    icon: string;
    humidity: number;
    windSpeed: number;
  };
  forecast?: {
    condition: string;
    icon: string;
    tempHigh: number;
    tempLow: number;
    precipitation: number;
  };
  alerts?: {
    type: 'warning' | 'watch' | 'advisory';
    message: string;
  }[];
  recommendation?: string;
}

export interface PricingCardData {
  ticketPrice?: {
    adult: number;
    child?: number;
    senior?: number;
    currency: string;
    lastChecked: Date;
  };
  estimatedCost?: {
    min: number;
    max: number;
    currency: string;
    category: string;
  };
  exchangeRate?: {
    localCurrency: string;
    rate: number;
    convertedPrice: number;
    baseCurrency: string;
  };
  budgetImpact?: {
    percentage: number;
    remaining: number;
    status: 'within_budget' | 'approaching_limit' | 'over_budget';
  };
}

export interface TransportCardData {
  toLocation?: {
    method: 'walking' | 'driving' | 'public_transport' | 'taxi';
    duration: string;
    distance: string;
    cost?: number;
    instructions?: string[];
  };
  fromPrevious?: {
    method: string;
    duration: string;
    distance: string;
    departureTime?: string;
    arrivalTime?: string;
  };
  publicTransport?: {
    routes: {
      type: 'bus' | 'subway' | 'train';
      line: string;
      departure: string;
      arrival: string;
    }[];
    totalTime: string;
    cost: number;
  };
  traffic?: {
    status: 'light' | 'moderate' | 'heavy';
    delayMinutes: number;
    alternativeRoute?: boolean;
  };
}

export interface CrowdingCardData {
  currentLevel: 'low' | 'moderate' | 'high' | 'very_high';
  prediction?: {
    [hour: string]: 'low' | 'moderate' | 'high' | 'very_high';
  };
  bestVisitTime?: string;
  waitTime?: {
    estimated: string;
    confidence: number;
  };
}

export interface ReviewsCardData {
  rating: number;
  totalReviews: number;
  recentReviews: {
    rating: number;
    text: string;
    date: Date;
    helpful?: boolean;
  }[];
  summary: {
    positive: string[];
    negative: string[];
  };
  photos?: string[];
}

export interface OperatingHoursCardData {
  today: {
    open: string;
    close: string;
    isOpen: boolean;
    nextChange?: {
      action: 'opens' | 'closes';
      time: string;
    };
  };
  week: {
    [day: string]: {
      open: string;
      close: string;
      isClosed: boolean;
    };
  };
  specialHours?: {
    date: Date;
    hours: string;
    reason: string;
  }[];
}

export interface ItineraryCardAction {
  id: string;
  type: 'navigation' | 'booking' | 'sharing' | 'modification' | 'information';
  label: string;
  icon?: string;
  action: string; // URL or action identifier
  enabled: boolean;
  requiresAuth?: boolean;
}

export class ItineraryCardGenerator {
  private mcpManager: MCPManager;
  
  constructor(mcpManager: MCPManager) {
    this.mcpManager = mcpManager;
  }
  
  async generateTripCards(tripId: string): Promise<ItineraryCard[]> {
    try {
      // Get trip with destinations
      const trip = await TripRepository.findByIdWithDestinations(tripId);
      if (!trip) {
        throw new Error('Trip not found');
      }
      
      const cards: ItineraryCard[] = [];
      
      // Generate cards for each destination
      if (trip.destinations) {
        for (let i = 0; i < trip.destinations.length; i++) {
          const destination = trip.destinations[i];
          const card = await this.generateDestinationCard(trip, destination, i);
          cards.push(card);
        }
      }
      
      // Sort cards by date and time
      cards.sort((a, b) => {
        const dateA = a.basicInfo.date.getTime();
        const dateB = b.basicInfo.date.getTime();
        if (dateA !== dateB) return dateA - dateB;
        
        const timeA = a.basicInfo.startTime || '00:00';
        const timeB = b.basicInfo.startTime || '00:00';
        return timeA.localeCompare(timeB);
      });
      
      return cards;
    } catch (error) {
      console.error('Error generating trip cards:', error);
      throw new Error(`Failed to generate trip cards: ${error}`);
    }
  }
  
  async generateDestinationCard(
    trip: Trip, 
    destination: Destination, 
    dayIndex: number
  ): Promise<ItineraryCard> {
    const tripStartDate = new Date(trip.startDate);
    const cardDate = new Date(tripStartDate);
    cardDate.setDate(tripStartDate.getDate() + dayIndex);
    
    // Get enriched data
    const enrichedData = await this.enrichDestinationData(destination, cardDate);
    
    const card: ItineraryCard = {
      id: `card-${destination.id || `dest-${dayIndex}`}`,
      tripId: trip.id,
      type: 'destination',
      title: destination.name,
      description: destination.description,
      
      basicInfo: {
        date: cardDate,
        startTime: '09:00', // Default start time
        endTime: '17:00',   // Default end time
        location: {
          name: destination.name,
          address: destination.city ? `${destination.city}, ${destination.country}` : undefined,
          coordinates: destination.latitude && destination.longitude ? {
            lat: destination.latitude,
            lng: destination.longitude
          } : undefined
        },
        status: 'planned'
      },
      
      enrichedData,
      
      actions: this.generateDestinationActions(destination),
      
      metadata: {
        priority: 'medium',
        tags: ['destination', destination.country || 'unknown'].filter(Boolean),
        createdBy: trip.createdBy,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };
    
    return card;
  }
  
  private async enrichDestinationData(
    destination: Destination, 
    date: Date
  ): Promise<ItineraryCard['enrichedData']> {
    const enrichedData: ItineraryCard['enrichedData'] = {
      lastUpdated: new Date()
    };
    
    // Get weather data if coordinates are available
    if (destination.latitude && destination.longitude) {
      try {
        const weatherService = this.mcpManager.getService('weather');
        if (weatherService) {
          const weatherResponse = await weatherService.getCurrentWeather({
            lat: destination.latitude,
            lon: destination.longitude,
            units: 'metric'
          });
          
          if (weatherResponse.success && weatherResponse.data) {
            enrichedData.weather = {
              current: {
                temperature: weatherResponse.data.temperature,
                condition: weatherResponse.data.description,
                icon: weatherResponse.data.icon,
                humidity: weatherResponse.data.humidity,
                windSpeed: weatherResponse.data.windSpeed
              },
              recommendation: this.generateWeatherRecommendation(weatherResponse.data)
            };
          }
        }
      } catch (error) {
        console.error('Error fetching weather data:', error);
      }
    }
    
    // Get exchange rate data
    try {
      const exchangeService = this.mcpManager.getService('exchangeRate');
      if (exchangeService && destination.country) {
        // This would need to be enhanced with actual country-to-currency mapping
        const localCurrency = this.getCountryCurrency(destination.country);
        if (localCurrency && localCurrency !== 'USD') {
          const rateResponse = await exchangeService.getExchangeRate({ 
            from: 'USD', 
            to: localCurrency 
          });
          if (rateResponse.success && rateResponse.data) {
            enrichedData.pricing = {
              exchangeRate: {
                localCurrency,
                rate: rateResponse.data.rate,
                convertedPrice: 100 * rateResponse.data.rate, // Example: $100 USD converted
                baseCurrency: 'USD'
              }
            };
          }
        }
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
    }
    
    // Add mock transport data (would be enhanced with real route planning)
    enrichedData.transport = {
      toLocation: {
        method: 'walking',
        duration: '15 min',
        distance: '1.2 km',
        instructions: ['Head north on Main St', 'Turn right at the square']
      }
    };
    
    // Add mock operating hours
    enrichedData.operatingHours = {
      today: {
        open: '09:00',
        close: '18:00',
        isOpen: this.isCurrentlyOpen('09:00', '18:00'),
        nextChange: this.getNextChange('09:00', '18:00')
      },
      week: {
        'monday': { open: '09:00', close: '18:00', isClosed: false },
        'tuesday': { open: '09:00', close: '18:00', isClosed: false },
        'wednesday': { open: '09:00', close: '18:00', isClosed: false },
        'thursday': { open: '09:00', close: '18:00', isClosed: false },
        'friday': { open: '09:00', close: '18:00', isClosed: false },
        'saturday': { open: '10:00', close: '17:00', isClosed: false },
        'sunday': { open: '10:00', close: '16:00', isClosed: false }
      }
    };
    
    return enrichedData;
  }
  
  private generateDestinationActions(destination: Destination): ItineraryCardAction[] {
    const actions: ItineraryCardAction[] = [
      {
        id: 'navigate',
        type: 'navigation',
        label: 'Get Directions',
        icon: 'navigation',
        action: destination.latitude && destination.longitude 
          ? `https://maps.google.com/?q=${destination.latitude},${destination.longitude}`
          : `https://maps.google.com/?q=${encodeURIComponent(destination.name)}`,
        enabled: true
      },
      {
        id: 'share',
        type: 'sharing',
        label: 'Share',
        icon: 'share',
        action: 'share_destination',
        enabled: true
      }
    ];
    
    return actions;
  }
  
  private generateWeatherRecommendation(weatherData: any): string {
    if (weatherData.temperature < 10) {
      return 'Dress warmly - it\'s quite cold outside!';
    } else if (weatherData.temperature > 30) {
      return 'Stay hydrated - it\'s very hot today!';
    } else if (weatherData.description.toLowerCase().includes('rain')) {
      return 'Don\'t forget an umbrella - rain is expected!';
    } else {
      return 'Perfect weather for outdoor activities!';
    }
  }
  
  private getCountryCurrency(country: string): string | null {
    // Simple mapping - would be enhanced with a comprehensive database
    const currencyMap: Record<string, string> = {
      'Japan': 'JPY',
      'United Kingdom': 'GBP',
      'Germany': 'EUR',
      'France': 'EUR',
      'Italy': 'EUR',
      'Spain': 'EUR',
      'Canada': 'CAD',
      'Australia': 'AUD',
      'China': 'CNY',
      'South Korea': 'KRW'
    };
    
    return currencyMap[country] || null;
  }
  
  private isCurrentlyOpen(openTime: string, closeTime: string): boolean {
    const now = new Date();
    const currentTime = now.getHours() * 100 + now.getMinutes();
    const [openHour, openMin] = openTime.split(':').map(Number);
    const [closeHour, closeMin] = closeTime.split(':').map(Number);
    const open = openHour * 100 + openMin;
    const close = closeHour * 100 + closeMin;
    
    return currentTime >= open && currentTime <= close;
  }
  
  private getNextChange(openTime: string, closeTime: string): { action: 'opens' | 'closes'; time: string } | undefined {
    const now = new Date();
    const currentTime = now.getHours() * 100 + now.getMinutes();
    const [openHour, openMin] = openTime.split(':').map(Number);
    const [closeHour, closeMin] = closeTime.split(':').map(Number);
    const open = openHour * 100 + openMin;
    const close = closeHour * 100 + closeMin;
    
    if (currentTime < open) {
      return { action: 'opens', time: openTime };
    } else if (currentTime < close) {
      return { action: 'closes', time: closeTime };
    } else {
      // Next day opening
      return { action: 'opens', time: `${openTime} tomorrow` };
    }
  }
}

// Singleton instance
export const itineraryCardGenerator = new ItineraryCardGenerator(new MCPManager());
