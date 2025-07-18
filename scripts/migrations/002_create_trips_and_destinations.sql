-- Create trips table
CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    budget DECIMAL(15, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) CHECK (status IN ('planning', 'in-progress', 'completed')) DEFAULT 'planning',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visibility VARCHAR(20) CHECK (visibility IN ('private', 'shared', 'public')) DEFAULT 'private',
    settings JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_dates CHECK (start_date <= end_date)
);

-- Create destinations table
CREATE TABLE destinations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    city VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    description TEXT,
    order_index INTEGER DEFAULT 0,
    place_id VARCHAR(255),
    address TEXT,
    arrival_date TIMESTAMP WITH TIME ZONE,
    departure_date TIMESTAMP WITH TIME ZONE,
    accommodation_info JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create trip collaborators table
CREATE TABLE trip_collaborators (
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) CHECK (role IN ('owner', 'editor', 'viewer')) NOT NULL,
    permissions JSONB DEFAULT '[]',
    invited_by UUID REFERENCES users(id),
    invitation_status VARCHAR(20) CHECK (invitation_status IN ('pending', 'accepted', 'declined')) DEFAULT 'accepted',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (trip_id, user_id)
);

-- Create indexes
CREATE INDEX idx_trips_created_by ON trips(created_by);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_start_date ON trips(start_date);
CREATE INDEX idx_trips_end_date ON trips(end_date);

CREATE INDEX idx_destinations_trip_id ON destinations(trip_id);
CREATE INDEX idx_destinations_order_index ON destinations(trip_id, order_index);
CREATE INDEX idx_destinations_coordinates ON destinations(latitude, longitude);

CREATE INDEX idx_trip_collaborators_user_id ON trip_collaborators(user_id);
CREATE INDEX idx_trip_collaborators_role ON trip_collaborators(role);

-- Create triggers
CREATE TRIGGER update_trips_updated_at 
    BEFORE UPDATE ON trips 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_destinations_updated_at 
    BEFORE UPDATE ON destinations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
