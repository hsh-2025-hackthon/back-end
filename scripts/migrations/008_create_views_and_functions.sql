-- Create views for common queries

-- View for trip summary with member count and recent activity
CREATE VIEW trip_summary AS
SELECT 
    t.id,
    t.title,
    t.description,
    t.start_date,
    t.end_date,
    t.budget,
    t.currency,
    t.status,
    t.created_by,
    t.created_at,
    t.updated_at,
    u.name as creator_name,
    COUNT(DISTINCT tc.user_id) as member_count,
    COUNT(DISTINCT d.id) as destination_count,
    COALESCE(SUM(e.base_amount), 0) as total_expenses,
    MAX(cm.created_at) as last_chat_activity,
    COUNT(DISTINCT v.id) as active_votes_count
FROM trips t
LEFT JOIN users u ON t.created_by = u.id
LEFT JOIN trip_collaborators tc ON t.id = tc.trip_id
LEFT JOIN destinations d ON t.id = d.trip_id
LEFT JOIN expenses e ON t.id = e.trip_id AND e.status = 'active'
LEFT JOIN chat_rooms cr ON t.id = cr.trip_id
LEFT JOIN chat_messages cm ON cr.id = cm.room_id AND cm.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
LEFT JOIN votes v ON t.id = v.trip_id AND v.status = 'active'
GROUP BY t.id, t.title, t.description, t.start_date, t.end_date, t.budget, t.currency, t.status, t.created_by, t.created_at, t.updated_at, u.name;

-- View for expense summary by user
CREATE VIEW expense_summary_by_user AS
SELECT 
    e.trip_id,
    e.user_id,
    u.name as user_name,
    COUNT(*) as expense_count,
    SUM(e.base_amount) as total_paid,
    SUM(es.base_amount) as total_owed,
    SUM(e.base_amount) - SUM(es.base_amount) as net_balance,
    e.base_currency as currency
FROM expenses e
JOIN users u ON e.user_id = u.id
LEFT JOIN expense_splits es ON e.id = es.expense_id AND es.user_id = e.user_id
WHERE e.status = 'active'
GROUP BY e.trip_id, e.user_id, u.name, e.base_currency;

-- View for chat room with unread message counts
CREATE VIEW chat_room_summary AS
SELECT 
    cr.id,
    cr.trip_id,
    cr.name,
    cr.description,
    cr.is_default,
    cr.room_type,
    cr.created_by,
    cr.created_at,
    cr.updated_at,
    COUNT(DISTINCT crm.user_id) as member_count,
    COUNT(DISTINCT cm.id) as total_messages,
    MAX(cm.created_at) as last_message_at,
    (SELECT content FROM chat_messages WHERE room_id = cr.id ORDER BY created_at DESC LIMIT 1) as last_message_content,
    (SELECT u.name FROM chat_messages cm2 JOIN users u ON cm2.user_id = u.id WHERE cm2.room_id = cr.id ORDER BY cm2.created_at DESC LIMIT 1) as last_message_author
FROM chat_rooms cr
LEFT JOIN chat_room_members crm ON cr.id = crm.room_id
LEFT JOIN chat_messages cm ON cr.id = cm.room_id AND cm.is_deleted = FALSE
GROUP BY cr.id, cr.trip_id, cr.name, cr.description, cr.is_default, cr.room_type, cr.created_by, cr.created_at, cr.updated_at;

-- View for vote results summary
CREATE VIEW vote_results_summary AS
SELECT 
    v.id as vote_id,
    v.title,
    v.status,
    v.deadline,
    COUNT(DISTINCT vr.user_id) as total_responses,
    COUNT(DISTINCT vp.user_id) as total_eligible,
    CASE 
        WHEN COUNT(DISTINCT vp.user_id) > 0 
        THEN ROUND((COUNT(DISTINCT vr.user_id)::decimal / COUNT(DISTINCT vp.user_id)) * 100, 2)
        ELSE 0 
    END as participation_rate,
    jsonb_agg(
        DISTINCT jsonb_build_object(
            'option_id', option->>'id',
            'option_name', option->>'name',
            'vote_count', (
                SELECT COUNT(*) 
                FROM vote_responses vr2 
                WHERE vr2.vote_id = v.id 
                AND vr2.selected_options @> jsonb_build_array(option->>'id')
            )
        )
    ) as option_results
FROM votes v
LEFT JOIN vote_responses vr ON v.id = vr.vote_id
LEFT JOIN vote_participants vp ON v.id = vp.vote_id
CROSS JOIN LATERAL jsonb_array_elements(v.options) as option
GROUP BY v.id, v.title, v.status, v.deadline;

-- View for budget tracking
CREATE VIEW budget_tracking AS
SELECT 
    b.id,
    b.trip_id,
    b.category,
    b.total_amount,
    b.currency,
    b.alert_threshold,
    COALESCE(SUM(e.base_amount), 0) as spent_amount,
    b.total_amount - COALESCE(SUM(e.base_amount), 0) as remaining_amount,
    CASE 
        WHEN b.total_amount > 0 
        THEN ROUND((COALESCE(SUM(e.base_amount), 0) / b.total_amount) * 100, 2)
        ELSE 0 
    END as spent_percentage,
    CASE 
        WHEN b.total_amount > 0 AND (COALESCE(SUM(e.base_amount), 0) / b.total_amount) * 100 >= b.alert_threshold
        THEN TRUE
        ELSE FALSE
    END as is_over_threshold
FROM budgets b
LEFT JOIN expenses e ON b.trip_id = e.trip_id 
    AND (b.category IS NULL OR e.category = b.category)
    AND e.status = 'active'
GROUP BY b.id, b.trip_id, b.category, b.total_amount, b.currency, b.alert_threshold;

-- View for user activity summary
CREATE VIEW user_activity_summary AS
SELECT 
    u.id as user_id,
    u.name,
    u.email,
    COUNT(DISTINCT t.id) as trips_count,
    COUNT(DISTINCT tc.trip_id) as collaborating_trips_count,
    COUNT(DISTINCT e.id) as expenses_count,
    COALESCE(SUM(e.base_amount), 0) as total_expenses_amount,
    COUNT(DISTINCT cm.id) as messages_count,
    COUNT(DISTINCT v.id) as votes_created_count,
    COUNT(DISTINCT vr.id) as vote_responses_count,
    MAX(GREATEST(
        t.updated_at,
        tc.joined_at,
        e.created_at,
        cm.created_at,
        v.created_at,
        vr.created_at
    )) as last_activity
FROM users u
LEFT JOIN trips t ON u.id = t.created_by
LEFT JOIN trip_collaborators tc ON u.id = tc.user_id
LEFT JOIN expenses e ON u.id = e.user_id
LEFT JOIN chat_messages cm ON u.id = cm.user_id
LEFT JOIN votes v ON u.id = v.creator_id
LEFT JOIN vote_responses vr ON u.id = vr.user_id
GROUP BY u.id, u.name, u.email;

-- View for upcoming activities from itineraries
CREATE VIEW upcoming_activities AS
SELECT 
    ia.id,
    ia.title,
    ia.activity_type,
    ia.start_time,
    ia.end_time,
    ia.estimated_cost,
    ia.currency,
    ia.status,
    id_day.date as activity_date,
    id_day.itinerary_id,
    i.trip_id,
    t.title as trip_title,
    ia.location,
    ia.booking_info,
    ia.notes,
    CASE 
        WHEN id_day.date = CURRENT_DATE AND ia.start_time > CURRENT_TIME THEN 'today'
        WHEN id_day.date = CURRENT_DATE + INTERVAL '1 day' THEN 'tomorrow'
        WHEN id_day.date > CURRENT_DATE THEN 'upcoming'
        ELSE 'past'
    END as time_category
FROM itinerary_activities ia
JOIN itinerary_days id_day ON ia.itinerary_day_id = id_day.id
JOIN itineraries i ON id_day.itinerary_id = i.id
JOIN trips t ON i.trip_id = t.id
WHERE id_day.date >= CURRENT_DATE - INTERVAL '1 day'
ORDER BY id_day.date, ia.start_time;

-- Create function to get user's trip permissions
CREATE OR REPLACE FUNCTION get_user_trip_permissions(user_id UUID, trip_id UUID)
RETURNS TABLE(
    can_view BOOLEAN,
    can_edit BOOLEAN,
    can_admin BOOLEAN,
    role VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        TRUE as can_view,
        CASE WHEN tc.role IN ('owner', 'editor') THEN TRUE ELSE FALSE END as can_edit,
        CASE WHEN tc.role = 'owner' THEN TRUE ELSE FALSE END as can_admin,
        tc.role
    FROM trip_collaborators tc
    WHERE tc.user_id = get_user_trip_permissions.user_id 
    AND tc.trip_id = get_user_trip_permissions.trip_id
    AND tc.invitation_status = 'accepted'
    
    UNION ALL
    
    SELECT 
        TRUE as can_view,
        TRUE as can_edit,
        TRUE as can_admin,
        'owner'::VARCHAR(20) as role
    FROM trips t
    WHERE t.id = get_user_trip_permissions.trip_id 
    AND t.created_by = get_user_trip_permissions.user_id
    AND NOT EXISTS (
        SELECT 1 FROM trip_collaborators tc2 
        WHERE tc2.trip_id = get_user_trip_permissions.trip_id 
        AND tc2.user_id = get_user_trip_permissions.user_id
    )
    
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
