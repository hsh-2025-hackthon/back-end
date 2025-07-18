-- Create votes table
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    chat_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    vote_type VARCHAR(30) CHECK (vote_type IN ('destination', 'restaurant', 'activity', 'budget', 'accommodation', 'transportation', 'custom')) NOT NULL,
    options JSONB NOT NULL DEFAULT '[]',
    settings JSONB NOT NULL DEFAULT '{}',
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deadline TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) CHECK (status IN ('active', 'closed', 'cancelled')) DEFAULT 'active',
    result_summary JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create vote responses table
CREATE TABLE vote_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vote_id UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    selected_options JSONB NOT NULL DEFAULT '[]',
    ranking JSONB DEFAULT '{}',
    comment TEXT,
    is_anonymous BOOLEAN DEFAULT FALSE,
    confidence_score DECIMAL(3, 2),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(vote_id, user_id)
);

-- Create vote participants table (eligible voters)
CREATE TABLE vote_participants (
    vote_id UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weight DECIMAL(5, 2) DEFAULT 1.0,
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (vote_id, user_id)
);

-- Create indexes
CREATE INDEX idx_votes_trip_id ON votes(trip_id);
CREATE INDEX idx_votes_creator_id ON votes(creator_id);
CREATE INDEX idx_votes_status ON votes(status);
CREATE INDEX idx_votes_deadline ON votes(deadline);
CREATE INDEX idx_votes_chat_message_id ON votes(chat_message_id);
CREATE INDEX idx_votes_vote_type ON votes(vote_type);

CREATE INDEX idx_vote_responses_vote_id ON vote_responses(vote_id);
CREATE INDEX idx_vote_responses_user_id ON vote_responses(user_id);
CREATE INDEX idx_vote_responses_created_at ON vote_responses(vote_id, created_at);

CREATE INDEX idx_vote_participants_user_id ON vote_participants(user_id);

-- Create triggers
CREATE TRIGGER update_votes_updated_at 
    BEFORE UPDATE ON votes 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vote_responses_updated_at 
    BEFORE UPDATE ON vote_responses 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
