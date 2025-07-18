-- Migration 011: Create AI Agent Sessions and Logs Tables

-- Create agent_sessions table for persistent session storage
CREATE TABLE agent_sessions (
    id VARCHAR(255) PRIMARY KEY, -- Use generated session ID from AgentCoordinator
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) CHECK (status IN ('active', 'completed', 'failed', 'cancelled')) NOT NULL DEFAULT 'active',
    current_step VARCHAR(100) NOT NULL DEFAULT 'initialization',
    progress INTEGER CHECK (progress >= 0 AND progress <= 100) NOT NULL DEFAULT 0,
    workflow_type VARCHAR(50) NOT NULL, -- 'full_optimization', 'requirement_analysis', etc.
    input_data JSONB NOT NULL DEFAULT '{}', -- Store original input parameters
    results JSONB NOT NULL DEFAULT '{}', -- Store session results
    errors TEXT[] DEFAULT '{}', -- Array of error messages
    metadata JSONB DEFAULT '{}', -- Additional session metadata
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create agent_session_logs table for detailed execution logs
CREATE TABLE agent_session_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    level VARCHAR(10) CHECK (level IN ('debug', 'info', 'warn', 'error')) NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    component VARCHAR(100), -- Agent or component name
    step VARCHAR(100), -- Current processing step
    metadata JSONB DEFAULT '{}', -- Additional structured data
    error_details JSONB, -- Error information if applicable
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX idx_agent_sessions_trip_id ON agent_sessions(trip_id);
CREATE INDEX idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX idx_agent_sessions_start_time ON agent_sessions(start_time DESC);

CREATE INDEX idx_agent_session_logs_session_id ON agent_session_logs(session_id);
CREATE INDEX idx_agent_session_logs_timestamp ON agent_session_logs(timestamp DESC);
CREATE INDEX idx_agent_session_logs_level ON agent_session_logs(level);
CREATE INDEX idx_agent_session_logs_component ON agent_session_logs(component);

-- Create triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_agent_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.last_activity = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_agent_session_updated_at
    BEFORE UPDATE ON agent_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_session_updated_at();

-- Add comments for documentation
COMMENT ON TABLE agent_sessions IS 'Stores AI agent workflow sessions with their state and results';
COMMENT ON TABLE agent_session_logs IS 'Detailed execution logs for AI agent sessions';
COMMENT ON COLUMN agent_sessions.workflow_type IS 'Type of AI workflow: full_optimization, requirement_analysis, itinerary_update, adaptive_adjustment';
COMMENT ON COLUMN agent_session_logs.level IS 'Log level: debug, info, warn, error';
COMMENT ON COLUMN agent_session_logs.component IS 'Name of the agent or component that generated this log entry';
