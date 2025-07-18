-- Migration 010: Create Version Control System
-- Add version control capabilities for trips

-- Trip versions table to store historical snapshots
CREATE TABLE IF NOT EXISTS trip_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    description TEXT,
    snapshot_data JSONB NOT NULL, -- Complete trip state at this version
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_auto_generated BOOLEAN DEFAULT FALSE, -- true for auto-snapshots, false for manual
    UNIQUE(trip_id, version_number)
);

-- Trip changes log for detailed change tracking
CREATE TABLE IF NOT EXISTS trip_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    version_id UUID REFERENCES trip_versions(id) ON DELETE SET NULL,
    change_type VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete'
    entity_type VARCHAR(50) NOT NULL, -- 'trip', 'destination', 'itinerary', etc.
    entity_id VARCHAR(255), -- ID of the changed entity
    field_name VARCHAR(100), -- specific field that changed
    old_value JSONB,
    new_value JSONB,
    change_description TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    operation_id UUID -- for grouping related changes
);

-- Trip conflicts table for semantic conflict resolution
CREATE TABLE IF NOT EXISTS trip_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    conflict_type VARCHAR(50) NOT NULL, -- 'semantic', 'structural', 'data'
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255),
    conflicting_data JSONB NOT NULL, -- details of the conflict
    involved_users UUID[] NOT NULL, -- users involved in the conflict
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'resolved', 'ignored'
    resolution_strategy VARCHAR(50), -- 'accept_mine', 'accept_theirs', 'merge_manual'
    resolved_data JSONB,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_trip_versions_trip_id ON trip_versions(trip_id);
CREATE INDEX idx_trip_versions_created_at ON trip_versions(created_at);
CREATE INDEX idx_trip_changes_trip_id ON trip_changes(trip_id);
CREATE INDEX idx_trip_changes_created_at ON trip_changes(created_at);
CREATE INDEX idx_trip_changes_operation_id ON trip_changes(operation_id);
CREATE INDEX idx_trip_conflicts_trip_id ON trip_conflicts(trip_id);
CREATE INDEX idx_trip_conflicts_status ON trip_conflicts(status);

-- Function to automatically create version snapshots
CREATE OR REPLACE FUNCTION create_trip_version_snapshot()
RETURNS TRIGGER AS $$
DECLARE
    next_version_number INTEGER;
    trip_data JSONB;
BEGIN
    -- Get next version number
    SELECT COALESCE(MAX(version_number), 0) + 1 
    INTO next_version_number 
    FROM trip_versions 
    WHERE trip_id = NEW.id;
    
    -- Build complete trip snapshot
    SELECT jsonb_build_object(
        'trip', row_to_json(NEW),
        'destinations', COALESCE(
            (SELECT jsonb_agg(row_to_json(d)) 
             FROM destinations d 
             WHERE d.trip_id = NEW.id), 
            '[]'::jsonb
        ),
        'collaborators', COALESCE(
            (SELECT jsonb_agg(row_to_json(tc)) 
             FROM trip_collaborators tc 
             WHERE tc.trip_id = NEW.id), 
            '[]'::jsonb
        )
    ) INTO trip_data;
    
    -- Create version snapshot (only for significant updates)
    IF TG_OP = 'INSERT' OR OLD.updated_at != NEW.updated_at THEN
        INSERT INTO trip_versions (
            trip_id, 
            version_number, 
            description, 
            snapshot_data, 
            created_by, 
            is_auto_generated
        ) VALUES (
            NEW.id,
            next_version_number,
            CASE 
                WHEN TG_OP = 'INSERT' THEN 'Trip created'
                ELSE 'Auto-snapshot on update'
            END,
            trip_data,
            NEW.created_by,
            true
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic version creation
DROP TRIGGER IF EXISTS trip_version_trigger ON trips;
CREATE TRIGGER trip_version_trigger
    AFTER INSERT OR UPDATE ON trips
    FOR EACH ROW
    EXECUTE FUNCTION create_trip_version_snapshot();
