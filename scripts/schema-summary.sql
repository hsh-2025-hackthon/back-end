-- Database Schema Summary
-- This file shows the complete structure after all migrations

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core Tables Summary:

/*
USERS SYSTEM:
- users: User accounts and profiles
- user_preferences: User settings and preferences  
- user_sessions: Authentication sessions
- external_integrations: OAuth and external service connections

TRIP MANAGEMENT:
- trips: Main trip entities
- destinations: Trip destinations and locations
- trip_collaborators: User permissions for trips

COMMUNICATION:
- chat_rooms: Discussion spaces within trips
- chat_messages: Individual messages
- chat_room_members: User membership in rooms
- message_reactions: Message reactions/emojis
- message_attachments: File attachments to messages

VOTING SYSTEM:
- votes: Group decision polls
- vote_responses: Individual user votes
- vote_participants: Eligible voters

EXPENSE MANAGEMENT:
- expenses: Individual expense records
- expense_splits: User portions of expenses
- expense_categories: Custom expense categories
- budgets: Budget tracking by category
- budget_alerts: Budget threshold notifications

ITINERARY SYSTEM:
- itineraries: Trip itinerary versions
- itinerary_days: Daily itinerary structure
- itinerary_activities: Planned activities
- activity_bookings: Booking information
- transportation_routes: Inter-destination transport

AI & RECOMMENDATIONS:
- ai_suggestions: AI-generated recommendations

SYSTEM TABLES:
- notifications: User notifications
- activity_logs: Audit trail
- file_uploads: File storage metadata
- webhooks: External service webhooks
- search_index: Full-text search index
- schema_migrations: Migration tracking

VIEWS:
- trip_summary: Trip overview with statistics
- expense_summary_by_user: User expense totals
- chat_room_summary: Chat activity summary
- vote_results_summary: Vote tallies and results
- budget_tracking: Budget vs actual spending
- user_activity_summary: User engagement metrics
- upcoming_activities: Future planned activities

FUNCTIONS:
- calculate_expense_splits(): Compute expense divisions
- get_trip_balance_summary(): User balance calculations
- get_user_trip_permissions(): Permission checking
- generate_notification(): Create notifications
- update_budget_spent_amounts(): Auto-update budgets
- create_default_chat_room(): Auto-create chat rooms
- add_collaborator_to_default_chat(): Auto-add users to chat
*/

-- To view all tables:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- To view table structure:
-- \d table_name (in psql)
-- OR 
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'your_table_name' 
-- ORDER BY ordinal_position;

-- Example queries to understand the schema:

-- 1. Get all trips with member counts
SELECT 
    t.title,
    t.status,
    COUNT(tc.user_id) as member_count,
    t.created_at
FROM trips t
LEFT JOIN trip_collaborators tc ON t.id = tc.trip_id
GROUP BY t.id, t.title, t.status, t.created_at
ORDER BY t.created_at DESC;

-- 2. Get expense summary for a trip
SELECT 
    u.name as payer_name,
    e.title,
    e.amount,
    e.currency,
    e.category,
    e.expense_date
FROM expenses e
JOIN users u ON e.payer_id = u.id
WHERE e.trip_id = 'YOUR_TRIP_ID'
ORDER BY e.expense_date DESC;

-- 3. Get chat activity summary
SELECT 
    cr.name as room_name,
    COUNT(cm.id) as message_count,
    MAX(cm.created_at) as last_message
FROM chat_rooms cr
LEFT JOIN chat_messages cm ON cr.id = cm.room_id
WHERE cr.trip_id = 'YOUR_TRIP_ID'
GROUP BY cr.id, cr.name
ORDER BY last_message DESC;

-- 4. Get voting results
SELECT 
    v.title,
    COUNT(vr.id) as response_count,
    v.status,
    v.deadline
FROM votes v
LEFT JOIN vote_responses vr ON v.id = vr.vote_id
WHERE v.trip_id = 'YOUR_TRIP_ID'
GROUP BY v.id, v.title, v.status, v.deadline
ORDER BY v.created_at DESC;
