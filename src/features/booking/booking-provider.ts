export interface BookingProvider {
  name: string;
  type: 'flight' | 'hotel' | 'activity';
  search(params: BookingSearchParams): Promise<BookingSearchResult>;
  getDetails(bookingId: string): Promise<BookingDetails>;
  book?(bookingData: BookingRequest): Promise<BookingConfirmation>;
}

export interface BookingSearchParams {
  type: 'flight' | 'hotel' | 'activity';
  destination?: string;
  origin?: string;
  checkIn?: Date;
  checkOut?: Date;
  departureDate?: Date;
  returnDate?: Date;
  guests?: number;
  passengers?: number;
  budget?: {
    min: number;
    max: number;
    currency: string;
  };
  preferences?: Record<string, any>;
}

export interface BookingSearchResult {
  provider: string;
  results: BookingOption[];
  searchId: string;
  timestamp: Date;
  totalResults: number;
}

export interface BookingOption {
  id: string;
  provider: string;
  type: 'flight' | 'hotel' | 'activity';
  title: string;
  description?: string;
  price: {
    amount: number;
    currency: string;
    breakdown?: PriceBreakdown[];
  };
  rating?: number;
  images?: string[];
  location?: {
    address: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  availability: {
    available: boolean;
    lastUpdated: Date;
    validUntil?: Date;
  };
  // Type-specific properties
  flightDetails?: FlightDetails;
  hotelDetails?: HotelDetails;
  activityDetails?: ActivityDetails;
}

export interface FlightDetails {
  airline: string;
  flightNumber: string;
  aircraft?: string;
  departure: {
    airport: string;
    time: Date;
    terminal?: string;
  };
  arrival: {
    airport: string;
    time: Date;
    terminal?: string;
  };
  duration: string;
  stops: number;
  stopDetails?: {
    airport: string;
    duration: string;
  }[];
  class: 'economy' | 'premium' | 'business' | 'first';
  baggage: {
    carry: string;
    checked: string;
  };
  cancellationPolicy?: string;
}

export interface HotelDetails {
  starRating: number;
  amenities: string[];
  roomType: string;
  roomSize?: string;
  bedType?: string;
  maxOccupancy: number;
  inclusions: string[];
  policies: {
    checkin: string;
    checkout: string;
    cancellation: string;
    pets?: string;
  };
  distance?: {
    cityCenter?: string;
    airport?: string;
    landmarks?: Record<string, string>;
  };
}

export interface ActivityDetails {
  duration: string;
  category: string;
  difficulty?: 'easy' | 'moderate' | 'challenging';
  minAge?: number;
  groupSize?: {
    min: number;
    max: number;
  };
  inclusions: string[];
  meetingPoint: string;
  languages: string[];
  cancellationPolicy: string;
}

export interface PriceBreakdown {
  component: string;
  amount: number;
  description?: string;
}

export interface BookingDetails extends BookingOption {
  terms: string;
  conditions: string[];
  contactInfo: {
    phone?: string;
    email?: string;
    website?: string;
  };
  bookingDeadline?: Date;
}

export interface BookingRequest {
  optionId: string;
  passengerInfo?: PassengerInfo[];
  guestInfo?: GuestInfo[];
  contactDetails: ContactDetails;
  paymentMethod: PaymentMethod;
  specialRequests?: string;
}

export interface PassengerInfo {
  title: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  passport?: {
    number: string;
    country: string;
    expiryDate: Date;
  };
  frequentFlyer?: {
    airline: string;
    number: string;
  };
  seatPreference?: string;
  mealPreference?: string;
}

export interface GuestInfo {
  title: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  specialRequests?: string;
}

export interface ContactDetails {
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    country: string;
    postalCode: string;
  };
}

export interface PaymentMethod {
  type: 'credit_card' | 'debit_card' | 'paypal' | 'bank_transfer';
  token?: string; // For tokenized payments
  cardLast4?: string;
  expiryMonth?: number;
  expiryYear?: number;
}

export interface BookingConfirmation {
  bookingId: string;
  confirmationNumber: string;
  status: 'confirmed' | 'pending' | 'failed';
  totalAmount: number;
  currency: string;
  bookingDetails: BookingDetails;
  tickets?: {
    type: string;
    url: string;
    qrCode?: string;
  }[];
  vouchers?: {
    type: string;
    url: string;
    code: string;
  }[];
  cancellationInfo: {
    deadline?: Date;
    fee?: number;
    instructions: string;
  };
}

export abstract class BaseBookingProvider implements BookingProvider {
  abstract name: string;
  abstract type: 'flight' | 'hotel' | 'activity';
  
  protected apiKey: string;
  protected baseUrl: string;
  
  constructor(config: { apiKey: string; baseUrl: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
  }
  
  abstract search(params: BookingSearchParams): Promise<BookingSearchResult>;
  abstract getDetails(bookingId: string): Promise<BookingDetails>;
  
  // Optional booking method - not all providers support direct booking
  async book?(bookingData: BookingRequest): Promise<BookingConfirmation> {
    throw new Error('Direct booking not supported by this provider');
  }
  
  protected async makeRequest<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }
}
