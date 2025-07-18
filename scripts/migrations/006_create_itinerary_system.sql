-- Create itineraries table
CREATE TABLE itineraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    version INTEGER DEFAULT 1,
    status VARCHAR(20) CHECK (status IN ('draft', 'active', 'archived')) DEFAULT 'draft',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_estimated_cost DECIMAL(15, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create itinerary days table
CREATE TABLE itinerary_days (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    day_number INTEGER NOT NULL,
    title VARCHAR(255),
    description TEXT,
    location VARCHAR(255),
    weather_info JSONB DEFAULT '{}',
    notes TEXT,
    estimated_cost DECIMAL(15, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(itinerary_id, date),
    UNIQUE(itinerary_id, day_number)
);

-- Create itinerary activities table
CREATE TABLE itinerary_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    itinerary_day_id UUID NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    activity_type VARCHAR(50) CHECK (activity_type IN ('transportation', 'accommodation', 'meal', 'attraction', 'activity', 'meeting', 'free_time', 'other')),
    location JSONB DEFAULT '{}',
    start_time TIME,
    end_time TIME,
    duration_minutes INTEGER,
    order_index INTEGER DEFAULT 0,
    estimated_cost DECIMAL(15, 2),
    currency VARCHAR(3),
    booking_info JSONB DEFAULT '{}',
    contact_info JSONB DEFAULT '{}',
    notes TEXT,
    is_booked BOOLEAN DEFAULT FALSE,
    booking_reference VARCHAR(255),
    status VARCHAR(20) CHECK (status IN ('planned', 'booked', 'confirmed', 'cancelled')) DEFAULT 'planned',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_time_range CHECK (start_time IS NULL OR end_time IS NULL OR start_time <= end_time),
    CONSTRAINT positive_duration CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    CONSTRAINT positive_cost CHECK (estimated_cost IS NULL OR estimated_cost >= 0)
);

-- Create activity bookings table
CREATE TABLE activity_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id UUID NOT NULL REFERENCES itinerary_activities(id) ON DELETE CASCADE,
    booking_provider VARCHAR(100),
    booking_reference VARCHAR(255),
    confirmation_number VARCHAR(255),
    booking_status VARCHAR(30) CHECK (booking_status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    booking_url TEXT,
    cancellation_policy TEXT,
    price DECIMAL(15, 2),
    currency VARCHAR(3),
    booked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    booking_date TIMESTAMP WITH TIME ZONE,
    check_in_time TIMESTAMP WITH TIME ZONE,
    check_out_time TIMESTAMP WITH TIME ZONE,
    guests_count INTEGER DEFAULT 1,
    special_requests TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT positive_price CHECK (price IS NULL OR price >= 0),
    CONSTRAINT positive_guests CHECK (guests_count > 0)
);

-- Create transportation routes table
CREATE TABLE transportation_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    from_destination_id UUID REFERENCES destinations(id) ON DELETE SET NULL,
    to_destination_id UUID REFERENCES destinations(id) ON DELETE SET NULL,
    from_location JSONB DEFAULT '{}',
    to_location JSONB DEFAULT '{}',
    transport_mode VARCHAR(30) CHECK (transport_mode IN ('flight', 'train', 'bus', 'car', 'taxi', 'ferry', 'walking', 'bicycle', 'other')),
    provider VARCHAR(100),
    departure_time TIMESTAMP WITH TIME ZONE,
    arrival_time TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,
    distance_km DECIMAL(10, 2),
    price DECIMAL(15, 2),
    currency VARCHAR(3),
    booking_reference VARCHAR(255),
    seat_preferences TEXT,
    luggage_info TEXT,
    route_details JSONB DEFAULT '{}',
    status VARCHAR(20) CHECK (status IN ('planned', 'booked', 'confirmed', 'cancelled', 'completed')) DEFAULT 'planned',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_duration CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    CONSTRAINT positive_distance CHECK (distance_km IS NULL OR distance_km >= 0),
    CONSTRAINT positive_price CHECK (price IS NULL OR price >= 0)
);

-- Create AI suggestions table
CREATE TABLE ai_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    suggestion_type VARCHAR(50) CHECK (suggestion_type IN ('destination', 'activity', 'restaurant', 'accommodation', 'itinerary', 'route', 'budget')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    data JSONB NOT NULL DEFAULT '{}',
    confidence_score DECIMAL(3, 2),
    source VARCHAR(100),
    status VARCHAR(20) CHECK (status IN ('pending', 'accepted', 'rejected', 'implemented')) DEFAULT 'pending',
    votes_for INTEGER DEFAULT 0,
    votes_against INTEGER DEFAULT 0,
    implemented_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- Create indexes
CREATE INDEX idx_itineraries_trip_id ON itineraries(trip_id);
CREATE INDEX idx_itineraries_default ON itineraries(trip_id, is_default);
CREATE INDEX idx_itineraries_status ON itineraries(status);
CREATE INDEX idx_itineraries_created_by ON itineraries(created_by);

CREATE INDEX idx_itinerary_days_itinerary_id ON itinerary_days(itinerary_id);
CREATE INDEX idx_itinerary_days_date ON itinerary_days(itinerary_id, date);
CREATE INDEX idx_itinerary_days_day_number ON itinerary_days(itinerary_id, day_number);

CREATE INDEX idx_itinerary_activities_day_id ON itinerary_activities(itinerary_day_id);
CREATE INDEX idx_itinerary_activities_order ON itinerary_activities(itinerary_day_id, order_index);
CREATE INDEX idx_itinerary_activities_type ON itinerary_activities(activity_type);
CREATE INDEX idx_itinerary_activities_time ON itinerary_activities(start_time);
CREATE INDEX idx_itinerary_activities_status ON itinerary_activities(status);

CREATE INDEX idx_activity_bookings_activity_id ON activity_bookings(activity_id);
CREATE INDEX idx_activity_bookings_status ON activity_bookings(booking_status);
CREATE INDEX idx_activity_bookings_booked_by ON activity_bookings(booked_by);
CREATE INDEX idx_activity_bookings_date ON activity_bookings(booking_date);

CREATE INDEX idx_transportation_routes_trip_id ON transportation_routes(trip_id);
CREATE INDEX idx_transportation_routes_from_dest ON transportation_routes(from_destination_id);
CREATE INDEX idx_transportation_routes_to_dest ON transportation_routes(to_destination_id);
CREATE INDEX idx_transportation_routes_mode ON transportation_routes(transport_mode);
CREATE INDEX idx_transportation_routes_departure ON transportation_routes(departure_time);
CREATE INDEX idx_transportation_routes_status ON transportation_routes(status);

CREATE INDEX idx_ai_suggestions_trip_id ON ai_suggestions(trip_id);
CREATE INDEX idx_ai_suggestions_type ON ai_suggestions(suggestion_type);
CREATE INDEX idx_ai_suggestions_status ON ai_suggestions(status);
CREATE INDEX idx_ai_suggestions_confidence ON ai_suggestions(confidence_score);
CREATE INDEX idx_ai_suggestions_expires ON ai_suggestions(expires_at);

-- Create triggers
CREATE TRIGGER update_itineraries_updated_at 
    BEFORE UPDATE ON itineraries 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_itinerary_days_updated_at 
    BEFORE UPDATE ON itinerary_days 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_itinerary_activities_updated_at 
    BEFORE UPDATE ON itinerary_activities 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activity_bookings_updated_at 
    BEFORE UPDATE ON activity_bookings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transportation_routes_updated_at 
    BEFORE UPDATE ON transportation_routes 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
