-- Insert default data

-- Insert default expense categories
INSERT INTO expense_categories (name, description, color, icon, is_default) VALUES
('Transportation', 'Flights, trains, buses, taxis, car rentals', '#3B82F6', 'plane', true),
('Accommodation', 'Hotels, hostels, vacation rentals', '#10B981', 'bed', true),
('Food', 'Restaurants, groceries, street food', '#F59E0B', 'utensils', true),
('Activities', 'Tours, attractions, entertainment', '#8B5CF6', 'camera', true),
('Shopping', 'Souvenirs, clothing, personal items', '#EC4899', 'shopping-bag', true),
('Other', 'Miscellaneous expenses', '#6B7280', 'receipt', true);

-- Insert default vote settings templates
INSERT INTO votes (id, trip_id, title, description, vote_type, options, settings, creator_id, status) VALUES
('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'Template: Destination Choice', 'Choose our next destination', 'destination', '[]', '{"multipleChoice": false, "anonymous": false, "changeVote": true, "requireComment": false, "showResults": "after_vote"}', '00000000-0000-0000-0000-000000000000', 'cancelled');

-- Create some useful stored procedures

-- Procedure to calculate expense splits
CREATE OR REPLACE FUNCTION calculate_expense_splits(expense_id UUID)
RETURNS TABLE(
    user_id UUID,
    amount DECIMAL(15,2),
    percentage DECIMAL(5,2)
) AS $$
DECLARE
    expense_record expenses%ROWTYPE;
    participant_count INTEGER;
    split_amount DECIMAL(15,2);
BEGIN
    -- Get the expense details
    SELECT * INTO expense_record FROM expenses e WHERE e.id = calculate_expense_splits.expense_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense not found';
    END IF;
    
    -- Calculate splits based on method
    CASE expense_record.split_method
        WHEN 'equal' THEN
            SELECT jsonb_array_length(expense_record.participants) INTO participant_count;
            split_amount := expense_record.base_amount / participant_count;
            
            RETURN QUERY
            SELECT 
                (participant->>'userId')::UUID as user_id,
                split_amount as amount,
                (100.0 / participant_count)::DECIMAL(5,2) as percentage
            FROM jsonb_array_elements(expense_record.participants) as participant;
            
        WHEN 'percentage' THEN
            RETURN QUERY
            SELECT 
                (participant->>'userId')::UUID as user_id,
                (expense_record.base_amount * (participant->>'percentage')::DECIMAL / 100) as amount,
                (participant->>'percentage')::DECIMAL(5,2) as percentage
            FROM jsonb_array_elements(expense_record.participants) as participant;
            
        WHEN 'custom' THEN
            RETURN QUERY
            SELECT 
                (participant->>'userId')::UUID as user_id,
                (participant->>'amount')::DECIMAL(15,2) as amount,
                ((participant->>'amount')::DECIMAL / expense_record.base_amount * 100) as percentage
            FROM jsonb_array_elements(expense_record.participants) as participant;
            
        WHEN 'shares' THEN
            DECLARE
                total_shares INTEGER;
            BEGIN
                SELECT SUM((participant->>'shares')::INTEGER) 
                INTO total_shares
                FROM jsonb_array_elements(expense_record.participants) as participant;
                
                RETURN QUERY
                SELECT 
                    (participant->>'userId')::UUID as user_id,
                    (expense_record.base_amount * (participant->>'shares')::INTEGER / total_shares) as amount,
                    ((participant->>'shares')::INTEGER::DECIMAL / total_shares * 100) as percentage
                FROM jsonb_array_elements(expense_record.participants) as participant;
            END;
            
        ELSE
            -- For 'none' or unknown methods, return empty result
            RETURN;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Function to get trip balance summary
CREATE OR REPLACE FUNCTION get_trip_balance_summary(trip_id UUID)
RETURNS TABLE(
    user_id UUID,
    user_name VARCHAR(255),
    total_paid DECIMAL(15,2),
    total_owed DECIMAL(15,2),
    net_balance DECIMAL(15,2),
    currency VARCHAR(3)
) AS $$
BEGIN
    RETURN QUERY
    WITH user_payments AS (
        SELECT 
            e.payer_id as user_id,
            SUM(e.base_amount) as total_paid,
            e.base_currency as currency
        FROM expenses e
        WHERE e.trip_id = get_trip_balance_summary.trip_id 
        AND e.status = 'active'
        GROUP BY e.payer_id, e.base_currency
    ),
    user_debts AS (
        SELECT 
            es.user_id,
            SUM(es.base_amount) as total_owed,
            es.base_currency as currency
        FROM expense_splits es
        JOIN expenses e ON es.expense_id = e.id
        WHERE e.trip_id = get_trip_balance_summary.trip_id 
        AND e.status = 'active'
        AND es.status != 'cancelled'
        GROUP BY es.user_id, es.base_currency
    )
    SELECT 
        COALESCE(up.user_id, ud.user_id) as user_id,
        u.name as user_name,
        COALESCE(up.total_paid, 0) as total_paid,
        COALESCE(ud.total_owed, 0) as total_owed,
        COALESCE(up.total_paid, 0) - COALESCE(ud.total_owed, 0) as net_balance,
        COALESCE(up.currency, ud.currency, 'USD') as currency
    FROM user_payments up
    FULL OUTER JOIN user_debts ud ON up.user_id = ud.user_id AND up.currency = ud.currency
    LEFT JOIN users u ON COALESCE(up.user_id, ud.user_id) = u.id
    ORDER BY net_balance DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to update budget spent amounts
CREATE OR REPLACE FUNCTION update_budget_spent_amounts()
RETURNS TRIGGER AS $$
BEGIN
    -- Update budgets for the affected trip
    UPDATE budgets b
    SET spent_amount = (
        SELECT COALESCE(SUM(e.base_amount), 0)
        FROM expenses e
        WHERE e.trip_id = b.trip_id
        AND (b.category IS NULL OR e.category = b.category)
        AND e.status = 'active'
    )
    WHERE b.trip_id = COALESCE(NEW.trip_id, OLD.trip_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update budget spent amounts
CREATE TRIGGER update_budget_on_expense_change
    AFTER INSERT OR UPDATE OR DELETE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_budget_spent_amounts();

-- Function to auto-create default chat room for new trips
CREATE OR REPLACE FUNCTION create_default_chat_room()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO chat_rooms (trip_id, name, description, is_default, room_type, created_by)
    VALUES (NEW.id, 'General', 'General discussion for this trip', true, 'general', NEW.created_by);
    
    -- Add the trip creator as an admin member
    INSERT INTO chat_room_members (room_id, user_id, role)
    SELECT cr.id, NEW.created_by, 'admin'
    FROM chat_rooms cr
    WHERE cr.trip_id = NEW.id AND cr.is_default = true;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-create default chat room
CREATE TRIGGER create_default_chat_room_trigger
    AFTER INSERT ON trips
    FOR EACH ROW
    EXECUTE FUNCTION create_default_chat_room();

-- Function to auto-add trip collaborators to default chat room
CREATE OR REPLACE FUNCTION add_collaborator_to_default_chat()
RETURNS TRIGGER AS $$
BEGIN
    -- Add to default chat room if invitation is accepted
    IF NEW.invitation_status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.invitation_status != 'accepted') THEN
        INSERT INTO chat_room_members (room_id, user_id, role)
        SELECT cr.id, NEW.user_id, 'member'
        FROM chat_rooms cr
        WHERE cr.trip_id = NEW.trip_id 
        AND cr.is_default = true
        ON CONFLICT (room_id, user_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-add collaborators to chat
CREATE TRIGGER add_collaborator_to_chat_trigger
    AFTER INSERT OR UPDATE ON trip_collaborators
    FOR EACH ROW
    EXECUTE FUNCTION add_collaborator_to_default_chat();

-- Function to generate notifications for important events
CREATE OR REPLACE FUNCTION generate_notification(
    p_user_id UUID,
    p_trip_id UUID DEFAULT NULL,
    p_type VARCHAR(50),
    p_title VARCHAR(255),
    p_message TEXT,
    p_data JSONB DEFAULT '{}',
    p_priority VARCHAR(20) DEFAULT 'normal'
)
RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO notifications (user_id, trip_id, type, title, message, data, priority)
    VALUES (p_user_id, p_trip_id, p_type, p_title, p_message, p_data, p_priority)
    RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON DATABASE "travel_planner" IS 'Collaborative Travel Planner Database - Complete schema with all tables, views, functions, and triggers for a full-featured travel planning application.';

-- Grant permissions (adjust as needed for your application)
-- GRANT USAGE ON SCHEMA public TO travel_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO travel_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO travel_app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO travel_app_user;
