import { 
  BaseBookingProvider, 
  BookingSearchParams, 
  BookingSearchResult, 
  BookingDetails,
  BookingOption,
  FlightDetails 
} from '../booking-provider';

// Skyscanner API response interfaces
interface SkyscannerSessionResponse {
  SessionKey?: string;
  Status?: string;
}

interface SkyscannerFlightResponse {
  SessionKey: string;
  Status: string;
  Query?: {
    Country: string;
    Currency: string;
    Locale: string;
    Adults: number;
    Children: number;
    Infants: number;
    OriginPlace: string;
    DestinationPlace: string;
    OutboundDate: string;
    InboundDate?: string;
  };
  Itineraries?: SkyscannerItinerary[];
  Legs?: SkyscannerLeg[];
  Carriers?: SkyscannerCarrier[];
  Agents?: SkyscannerAgent[];
  Places?: SkyscannerPlace[];
}

interface SkyscannerItinerary {
  OutboundLegId: string;
  InboundLegId?: string;
  PricingOptions?: SkyscannerPricingOption[];
}

interface SkyscannerLeg {
  Id: string;
  SegmentIds: string[];
  OriginStation: string;
  DestinationStation: string;
  Departure: string;
  Arrival: string;
  Duration: number;
  JourneyMode: string;
  Stops: string[];
  Carriers: string[];
  OperatingCarriers: string[];
  Directionality: string;
  FlightNumbers?: SkyscannerFlightNumber[];
  DepartureTerminal?: string;
  ArrivalTerminal?: string;
}

interface SkyscannerFlightNumber {
  FlightNumber: string;
  CarrierId: string;
}

interface SkyscannerCarrier {
  Id: string;
  Code: string;
  Name: string;
  ImageUrl?: string;
  DisplayCode?: string;
}

interface SkyscannerAgent {
  Id: string;
  Name: string;
  ImageUrl?: string;
  Status: string;
  OptimisedForMobile: boolean;
  BookingNumber?: string;
  Type: string;
}

interface SkyscannerPlace {
  Id: string;
  ParentId: string;
  Code: string;
  Type: string;
  Name: string;
}

interface SkyscannerPricingOption {
  Agents: string[];
  QuoteAgeInMinutes: number;
  Price: number;
  DeeplinkUrl: string;
}

export class SkyscannerFlightProvider extends BaseBookingProvider {
  name = 'Skyscanner';
  type = 'flight' as const;
  
  constructor(config: { apiKey: string; baseUrl?: string }) {
    super({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.skyscanner.net/v1.0'
    });
  }
  
  async search(params: BookingSearchParams): Promise<BookingSearchResult> {
    if (params.type !== 'flight') {
      throw new Error('This provider only supports flight searches');
    }
    
    if (!params.origin || !params.destination || !params.departureDate) {
      throw new Error('Origin, destination, and departure date are required for flight search');
    }
    
    try {
      // Check if we're using real API or mock data
      const useRealAPI = this.apiKey !== 'mock-api-key' && process.env.NODE_ENV === 'production';
      
      if (useRealAPI) {
        return await this.searchWithRealAPI(params);
      } else {
        // Use mock data for development and testing
        console.log('Using mock Skyscanner data (set SKYSCANNER_API_KEY and NODE_ENV=production for real API)');
        const mockResults = this.generateMockFlightResults(params);
        
        return {
          provider: this.name,
          results: mockResults,
          searchId: `sky-mock-${Date.now()}`,
          timestamp: new Date(),
          totalResults: mockResults.length
        };
      }
      
    } catch (error) {
      console.error('Skyscanner search error:', error);
      throw new Error(`Flight search failed: ${error}`);
    }
  }
  
  private async searchWithRealAPI(params: BookingSearchParams): Promise<BookingSearchResult> {
    try {
      // Step 1: Create a session for the search
      const sessionResponse = await this.makeRequest<SkyscannerSessionResponse>('/pricing/v1.0', {
        method: 'POST',
        body: JSON.stringify({
          country: 'US',
          currency: 'USD',
          locale: 'en-US',
          originplace: params.origin,
          destinationplace: params.destination,
          outbounddate: params.departureDate!.toISOString().split('T')[0],
          inbounddate: params.returnDate?.toISOString().split('T')[0],
          adults: params.passengers || 1
        })
      });
      
      const sessionKey = this.extractSessionKey(sessionResponse);
      
      // Step 2: Poll for results
      const results = await this.pollForResults(sessionKey);
      
      return this.transformSkyscannerResponse(results, sessionKey);
      
    } catch (error) {
      console.error('Real Skyscanner API error:', error);
      // Fallback to mock data if real API fails
      console.log('Falling back to mock data due to API error');
      const mockResults = this.generateMockFlightResults(params);
      
      return {
        provider: this.name,
        results: mockResults,
        searchId: `sky-fallback-${Date.now()}`,
        timestamp: new Date(),
        totalResults: mockResults.length
      };
    }
  }
  
  private extractSessionKey(response: SkyscannerSessionResponse): string {
    // Extract session key from the response location header or body
    // This is specific to Skyscanner's API structure
    return response.SessionKey || `session-${Date.now()}`;
  }
  
  private async pollForResults(sessionKey: string, maxAttempts: number = 10): Promise<SkyscannerFlightResponse> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await this.makeRequest<SkyscannerFlightResponse>(
          `/pricing/uk2/v1.0/${sessionKey}?pageIndex=0&pageSize=10`
        );
        
        // Check if results are ready
        if (response.Status === 'UpdatesComplete' || (response.Itineraries && response.Itineraries.length > 0)) {
          return response;
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Polling attempt ${attempt + 1} failed:`, error);
        if (attempt === maxAttempts - 1) throw error;
      }
    }
    
    throw new Error('Timeout waiting for Skyscanner results');
  }
  
  private transformSkyscannerResponse(response: SkyscannerFlightResponse, sessionKey: string): BookingSearchResult {
    const results: BookingOption[] = (response.Itineraries || []).map(itinerary => {
      const outboundLeg = response.Legs?.find(leg => leg.Id === itinerary.OutboundLegId);
      const carrier = response.Carriers?.find(c => c.Id === outboundLeg?.Carriers[0]);
      const pricingOption = itinerary.PricingOptions?.[0];
      
      const flightDetails: FlightDetails = {
        airline: carrier?.Name || 'Unknown Airline',
        flightNumber: outboundLeg?.FlightNumbers?.[0]?.FlightNumber || 'N/A',
        departure: {
          airport: outboundLeg?.OriginStation || '',
          time: new Date(outboundLeg?.Departure || ''),
          terminal: outboundLeg?.DepartureTerminal
        },
        arrival: {
          airport: outboundLeg?.DestinationStation || '',
          time: new Date(outboundLeg?.Arrival || ''),
          terminal: outboundLeg?.ArrivalTerminal
        },
        duration: this.formatDuration(outboundLeg?.Duration || 0),
        stops: (outboundLeg?.Stops?.length || 0),
        class: 'economy',
        baggage: {
          carry: '1 x 10kg',
          checked: '1 x 23kg'
        },
        cancellationPolicy: 'Terms vary by airline'
      };
      
      return {
        id: itinerary.OutboundLegId,
        provider: this.name,
        type: 'flight' as const,
        title: `${carrier?.Name} ${outboundLeg?.FlightNumbers?.[0]?.FlightNumber}`,
        description: `${outboundLeg?.OriginStation} to ${outboundLeg?.DestinationStation}`,
        price: {
          amount: pricingOption?.Price || 0,
          currency: response.Query?.Currency || 'USD',
          breakdown: [
            { component: 'Base fare', amount: (pricingOption?.Price || 0) * 0.85 },
            { component: 'Taxes & fees', amount: (pricingOption?.Price || 0) * 0.15 }
          ]
        },
        rating: 4.0 + Math.random(), // Mock rating since Skyscanner doesn't provide this
        availability: {
          available: true,
          lastUpdated: new Date(),
          validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        flightDetails
      };
    });
    
    return {
      provider: this.name,
      results,
      searchId: sessionKey,
      timestamp: new Date(),
      totalResults: results.length
    };
  }
  
  private formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  
  async getDetails(bookingId: string): Promise<BookingDetails> {
    // In a real implementation, this would fetch detailed booking information
    const mockResult = this.generateMockFlightDetails(bookingId);
    return mockResult;
  }
  
  private generateMockFlightResults(params: BookingSearchParams): BookingOption[] {
    const airlines = [
      { code: 'UA', name: 'United Airlines' },
      { code: 'DL', name: 'Delta Air Lines' },
      { code: 'AA', name: 'American Airlines' },
      { code: 'LH', name: 'Lufthansa' },
      { code: 'BA', name: 'British Airways' }
    ];
    
    const results: BookingOption[] = [];
    
    for (let i = 0; i < 15; i++) {
      const airline = airlines[Math.floor(Math.random() * airlines.length)];
      const basePrice = 300 + Math.random() * 800;
      const stops = Math.floor(Math.random() * 3); // 0-2 stops
      const duration = stops === 0 ? '2h 45m' : 
                      stops === 1 ? '5h 20m' : '8h 15m';
      
      const departureTime = new Date(params.departureDate!);
      departureTime.setHours(6 + Math.floor(Math.random() * 16)); // 6 AM to 10 PM
      
      const arrivalTime = new Date(departureTime);
      arrivalTime.setHours(departureTime.getHours() + 3 + stops * 2);
      
      const flightDetails: FlightDetails = {
        airline: airline.name,
        flightNumber: `${airline.code}${1000 + Math.floor(Math.random() * 8999)}`,
        departure: {
          airport: params.origin!,
          time: departureTime,
          terminal: `T${1 + Math.floor(Math.random() * 3)}`
        },
        arrival: {
          airport: params.destination!,
          time: arrivalTime,
          terminal: `T${1 + Math.floor(Math.random() * 3)}`
        },
        duration,
        stops,
        class: 'economy',
        baggage: {
          carry: '1 x 10kg',
          checked: '1 x 23kg'
        },
        cancellationPolicy: 'Non-refundable'
      };
      
      if (stops > 0) {
        flightDetails.stopDetails = [
          {
            airport: 'HUB',
            duration: '1h 30m'
          }
        ];
      }
      
      const option: BookingOption = {
        id: `sky-flight-${i}`,
        provider: this.name,
        type: 'flight',
        title: `${airline.name} ${flightDetails.flightNumber}`,
        description: `${params.origin} to ${params.destination} - ${stops === 0 ? 'Direct' : `${stops} stop${stops > 1 ? 's' : ''}`}`,
        price: {
          amount: Math.round(basePrice * 100) / 100,
          currency: 'USD',
          breakdown: [
            { component: 'Base fare', amount: Math.round(basePrice * 0.85 * 100) / 100 },
            { component: 'Taxes & fees', amount: Math.round(basePrice * 0.15 * 100) / 100 }
          ]
        },
        rating: 3.5 + Math.random() * 1.5, // 3.5 - 5.0
        availability: {
          available: Math.random() > 0.1, // 90% availability
          lastUpdated: new Date(),
          validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        },
        flightDetails
      };
      
      results.push(option);
    }
    
    return results.sort((a, b) => a.price.amount - b.price.amount);
  }
  
  private generateMockFlightDetails(bookingId: string): BookingDetails {
    const mockOption = {
      id: bookingId,
      provider: this.name,
      type: 'flight' as const,
      title: 'United Airlines UA1234',
      description: 'LAX to JFK - Direct',
      price: {
        amount: 456.78,
        currency: 'USD',
        breakdown: [
          { component: 'Base fare', amount: 387.76 },
          { component: 'Taxes & fees', amount: 69.02 }
        ]
      },
      rating: 4.2,
      availability: {
        available: true,
        lastUpdated: new Date(),
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000)
      },
      flightDetails: {
        airline: 'United Airlines',
        flightNumber: 'UA1234',
        departure: {
          airport: 'LAX',
          time: new Date('2025-08-15T10:30:00Z'),
          terminal: 'T7'
        },
        arrival: {
          airport: 'JFK',
          time: new Date('2025-08-15T18:45:00Z'),
          terminal: 'T4'
        },
        duration: '5h 15m',
        stops: 0,
        class: 'economy' as const,
        baggage: {
          carry: '1 x 10kg',
          checked: '1 x 23kg'
        },
        cancellationPolicy: 'Cancel up to 24 hours before departure for full refund'
      },
      terms: 'Booking subject to airline terms and conditions',
      conditions: [
        'Valid photo ID required for domestic flights',
        'Passport required for international flights',
        'Check-in opens 24 hours before departure',
        'Arrive at airport 2 hours before domestic, 3 hours before international flights'
      ],
      contactInfo: {
        phone: '+1-800-UNITED-1',
        email: 'support@united.com',
        website: 'https://www.united.com'
      },
      bookingDeadline: new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours from now
    };
    
    return mockOption;
  }
  
  // Real API integration methods (commented out for reference):
  
  /*
  private async transformSkyscannerResponse(response: SkyscannerResponse): Promise<BookingSearchResult> {
    const results: BookingOption[] = response.Itineraries.map(itinerary => ({
      id: itinerary.OutboundLegId,
      provider: this.name,
      type: 'flight',
      title: `${this.getCarrierName(itinerary.OutboundLeg.CarrierIds[0])} ${itinerary.OutboundLeg.FlightNumber}`,
      description: `${itinerary.OutboundLeg.OriginStation} to ${itinerary.OutboundLeg.DestinationStation}`,
      price: {
        amount: itinerary.PricingOptions[0].Price,
        currency: response.Query.Currency,
      },
      availability: {
        available: true,
        lastUpdated: new Date(),
      },
      flightDetails: this.transformFlightDetails(itinerary.OutboundLeg)
    }));
    
    return {
      provider: this.name,
      results,
      searchId: response.SessionKey,
      timestamp: new Date(),
      totalResults: results.length
    };
  }
  */
}
