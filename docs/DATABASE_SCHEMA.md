# Collaborative Travel Planner - Database Schema

This document describes the complete database schema for the collaborative travel planner application.

## Overview

The database is designed to support:
- Multi-user trip planning and collaboration
- Real-time chat and communication
- Expense tracking and splitting
- Voting on trip decisions
- AI-powered recommendations
- Itinerary management
- File uploads and attachments
- Notifications and activity tracking

## Database Structure

### Core Tables

#### 1. Users (`users`)
Stores user account information and preferences.

**Key Fields:**
- `id` (UUID, Primary Key)
- `name` (VARCHAR) - Display name
- `email` (VARCHAR, Unique) - Login email
- `google_id` (VARCHAR, Unique) - For OAuth integration
- `profile_picture_url` (TEXT)
- `timezone`, `language`, `currency_preference`
- `notification_settings` (JSONB)

#### 2. Trips (`trips`)
Main trip entities that users can create and collaborate on.

**Key Fields:**
- `id` (UUID, Primary Key)
- `title`, `description`
- `start_date`, `end_date` (TIMESTAMP WITH TIME ZONE)
- `budget` (DECIMAL), `currency` (VARCHAR)
- `status` ('planning', 'in-progress', 'completed')
- `created_by` (UUID, Foreign Key to users)
- `visibility` ('private', 'shared', 'public')

#### 3. Trip Collaborators (`trip_collaborators`)
Manages user permissions for trips.

**Key Fields:**
- `trip_id`, `user_id` (Composite Primary Key)
- `role` ('owner', 'editor', 'viewer')
- `permissions` (JSONB)
- `invitation_status` ('pending', 'accepted', 'declined')

#### 4. Destinations (`destinations`)
Locations within a trip.

**Key Fields:**
- `id` (UUID, Primary Key)
- `trip_id` (Foreign Key)
- `name`, `country`, `city`
- `latitude`, `longitude` (DECIMAL)
- `order_index` (INTEGER) - For ordering destinations
- `arrival_date`, `departure_date`

### Communication System

#### 5. Chat Rooms (`chat_rooms`)
Discussion spaces within trips.

**Key Fields:**
- `id` (UUID, Primary Key)
- `trip_id` (Foreign Key)
- `name`, `description`
- `is_default` (BOOLEAN) - Default room created with trip
- `room_type` ('general', 'planning', 'expenses', 'custom')

#### 6. Chat Messages (`chat_messages`)
Individual messages within chat rooms.

**Key Fields:**
- `id` (UUID, Primary Key)
- `room_id` (Foreign Key)
- `user_id` (Foreign Key)
- `content` (TEXT)
- `message_type` ('text', 'system', 'ai_suggestion', 'vote', etc.)
- `replied_to` (Self-referencing Foreign Key)
- `is_deleted` (BOOLEAN)

#### 7. Chat Room Members (`chat_room_members`)
User membership in chat rooms.

**Key Fields:**
- `room_id`, `user_id` (Composite Primary Key)
- `role` ('admin', 'member', 'viewer')
- `last_read_at` (TIMESTAMP) - For unread message counting
- `notification_enabled` (BOOLEAN)

### Voting System

#### 8. Votes (`votes`)
Polls for group decision making.

**Key Fields:**
- `id` (UUID, Primary Key)
- `trip_id` (Foreign Key)
- `title`, `description`
- `vote_type` ('destination', 'restaurant', 'activity', etc.)
- `options` (JSONB) - Array of voting options
- `settings` (JSONB) - Vote configuration
- `deadline` (TIMESTAMP)
- `status` ('active', 'closed', 'cancelled')

#### 9. Vote Responses (`vote_responses`)
Individual user votes.

**Key Fields:**
- `id` (UUID, Primary Key)
- `vote_id` (Foreign Key)
- `user_id` (Foreign Key)
- `selected_options` (JSONB) - Array of selected option IDs
- `ranking` (JSONB) - For ranked choice voting
- `comment` (TEXT)

#### 10. Vote Participants (`vote_participants`)
Eligible voters for each vote.

**Key Fields:**
- `vote_id`, `user_id` (Composite Primary Key)
- `weight` (DECIMAL) - Voting weight (default 1.0)

### Expense Management

#### 11. Expenses (`expenses`)
Individual expense records.

**Key Fields:**
- `id` (UUID, Primary Key)
- `trip_id` (Foreign Key)
- `user_id` (Foreign Key) - Who logged the expense
- `payer_id` (Foreign Key) - Who paid
- `title`, `description`
- `amount`, `currency`
- `base_amount`, `base_currency` - Normalized amounts
- `exchange_rate`
- `category` ('transportation', 'accommodation', etc.)
- `expense_date` (DATE)
- `participants` (JSONB) - Who splits this expense
- `split_method` ('equal', 'percentage', 'custom', 'shares')
- `receipt_urls` (JSONB)

#### 12. Expense Splits (`expense_splits`)
Individual user portions of expenses.

**Key Fields:**
- `id` (UUID, Primary Key)
- `expense_id` (Foreign Key)
- `user_id` (Foreign Key) - Who owes
- `payer_id` (Foreign Key) - Who paid
- `amount`, `currency`
- `status` ('pending', 'paid', 'cancelled', 'disputed')
- `due_date` (DATE)

#### 13. Budgets (`budgets`)
Budget tracking by category.

**Key Fields:**
- `id` (UUID, Primary Key)
- `trip_id` (Foreign Key)
- `category` (VARCHAR) - Budget category
- `total_amount`, `currency`
- `spent_amount` - Auto-calculated
- `alert_threshold` (DECIMAL) - Percentage for alerts

### Itinerary System

#### 14. Itineraries (`itineraries`)
Trip itinerary versions.

**Key Fields:**
- `id` (UUID, Primary Key)
- `trip_id` (Foreign Key)
- `name` - Itinerary name
- `is_default` (BOOLEAN)
- `version` (INTEGER)
- `status` ('draft', 'active', 'archived')

#### 15. Itinerary Days (`itinerary_days`)
Individual days in an itinerary.

**Key Fields:**
- `id` (UUID, Primary Key)
- `itinerary_id` (Foreign Key)
- `date` (DATE)
- `day_number` (INTEGER)
- `title`, `description`
- `estimated_cost`

#### 16. Itinerary Activities (`itinerary_activities`)
Planned activities within days.

**Key Fields:**
- `id` (UUID, Primary Key)
- `itinerary_day_id` (Foreign Key)
- `title`, `description`
- `activity_type` ('transportation', 'accommodation', 'meal', etc.)
- `start_time`, `end_time` (TIME)
- `location` (JSONB)
- `estimated_cost`
- `is_booked` (BOOLEAN)

#### 17. Transportation Routes (`transportation_routes`)
Transportation between destinations.

**Key Fields:**
- `id` (UUID, Primary Key)
- `trip_id` (Foreign Key)
- `from_destination_id`, `to_destination_id` (Foreign Keys)
- `transport_mode` ('flight', 'train', 'bus', etc.)
- `departure_time`, `arrival_time`
- `duration_minutes`, `distance_km`
- `price`, `currency`

### AI and Recommendations

#### 18. AI Suggestions (`ai_suggestions`)
AI-generated recommendations.

**Key Fields:**
- `id` (UUID, Primary Key)
- `trip_id` (Foreign Key)
- `suggestion_type` ('destination', 'activity', etc.)
- `title`, `description`
- `data` (JSONB) - Structured suggestion data
- `confidence_score` (DECIMAL)
- `status` ('pending', 'accepted', 'rejected')
- `expires_at` (TIMESTAMP)

### System Tables

#### 19. Notifications (`notifications`)
User notifications.

**Key Fields:**
- `id` (UUID, Primary Key)
- `user_id` (Foreign Key)
- `trip_id` (Foreign Key, Optional)
- `type` ('trip_invitation', 'expense_added', etc.)
- `title`, `message`
- `is_read` (BOOLEAN)
- `priority` ('low', 'normal', 'high', 'urgent')

#### 20. File Uploads (`file_uploads`)
Uploaded files and attachments.

**Key Fields:**
- `id` (UUID, Primary Key)
- `user_id` (Foreign Key)
- `trip_id` (Foreign Key, Optional)
- `filename`, `original_filename`
- `file_path`, `file_url`
- `file_size`, `mime_type`
- `purpose` ('avatar', 'receipt', 'chat_attachment', etc.)

#### 21. Activity Logs (`activity_logs`)
Audit trail for all actions.

**Key Fields:**
- `id` (UUID, Primary Key)
- `user_id` (Foreign Key)
- `trip_id` (Foreign Key, Optional)
- `entity_type`, `entity_id`
- `action` ('created', 'updated', 'deleted', etc.)
- `old_values`, `new_values` (JSONB)

## Views and Functions

### Views
- `trip_summary` - Trip overview with stats
- `expense_summary_by_user` - User expense totals
- `chat_room_summary` - Chat room activity
- `vote_results_summary` - Vote tallies
- `budget_tracking` - Budget vs. actual spending
- `upcoming_activities` - Future itinerary items

### Stored Functions
- `calculate_expense_splits()` - Computes expense splits
- `get_trip_balance_summary()` - User balance calculations
- `get_user_trip_permissions()` - Permission checking
- `generate_notification()` - Create notifications

## Indexes

The schema includes comprehensive indexing for:
- Foreign key relationships
- Frequently queried fields (dates, statuses, types)
- Full-text search capabilities
- Geographic coordinates
- JSON/JSONB fields where applicable

## Triggers

Automated triggers handle:
- `updated_at` timestamp maintenance
- Budget amount recalculation on expense changes
- Default chat room creation for new trips
- Auto-adding collaborators to chat rooms
- Search index updates

## Migration System

The schema uses a migration tracking system with:
- Checksum verification for migration integrity
- Rollback capability (planned)
- Status checking and reporting
- Incremental migration support

## Running Migrations

```bash
# Run all pending migrations
node scripts/migrate-sql.js

# Check migration status
node scripts/migrate-sql.js status

# Test database connection
npm run test-connections
```

## Environment Variables

Required database configuration:
- `DB_HOST` - Database host (default: localhost)
- `DB_PORT` - Database port (default: 5432)
- `DB_NAME` - Database name (default: travel_planner)
- `DB_USER` - Database user (default: postgres)
- `DB_PASSWORD` - Database password

## Security Considerations

- All UUID primary keys prevent enumeration attacks
- Row-level security can be implemented for multi-tenancy
- Sensitive data (passwords, tokens) stored in separate tables
- Audit logging for compliance requirements
- Input validation through database constraints

## Performance Notes

- Partitioning considered for large tables (activity_logs, notifications)
- Materialized views for complex reporting queries
- Connection pooling recommended
- Regular VACUUM and ANALYZE scheduled
- Index monitoring and optimization ongoing
