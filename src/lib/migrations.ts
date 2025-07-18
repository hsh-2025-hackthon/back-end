import { getDatabase } from '../config/database';
import { Pool } from 'pg';

interface Migration {
  id: string;
  name: string;
  up: string;
  down: string;
}

const migrations: Migration[] = [
  {
    id: '001',
    name: 'create_users_table',
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        google_id VARCHAR(255) UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_google_id ON users(google_id);
    `,
    down: `DROP TABLE IF EXISTS users;`
  },
  {
    id: '002',
    name: 'create_trips_table',
    up: `
      CREATE TYPE trip_status AS ENUM ('planning', 'in-progress', 'completed');
      
      CREATE TABLE IF NOT EXISTS trips (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        destination JSONB,
        budget DECIMAL(10,2),
        currency VARCHAR(3) DEFAULT 'USD',
        status trip_status DEFAULT 'planning',
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX idx_trips_created_by ON trips(created_by);
      CREATE INDEX idx_trips_status ON trips(status);
      CREATE INDEX idx_trips_dates ON trips(start_date, end_date);
    `,
    down: `
      DROP TABLE IF EXISTS trips;
      DROP TYPE IF EXISTS trip_status;
    `
  },
  {
    id: '003',
    name: 'create_trip_collaborators_table',
    up: `
      CREATE TYPE collaboration_role AS ENUM ('owner', 'editor', 'viewer');
      
      CREATE TABLE IF NOT EXISTS trip_collaborators (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role collaboration_role DEFAULT 'viewer',
        invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        accepted_at TIMESTAMP WITH TIME ZONE,
        UNIQUE(trip_id, user_id)
      );
      
      CREATE INDEX idx_trip_collaborators_trip_id ON trip_collaborators(trip_id);
      CREATE INDEX idx_trip_collaborators_user_id ON trip_collaborators(user_id);
    `,
    down: `
      DROP TABLE IF EXISTS trip_collaborators;
      DROP TYPE IF EXISTS collaboration_role;
    `
  },
  {
    id: '004',
    name: 'create_destinations_table',
    up: `
      CREATE TABLE IF NOT EXISTS destinations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        country VARCHAR(255),
        city VARCHAR(255),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        description TEXT,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX idx_destinations_trip_id ON destinations(trip_id);
      CREATE INDEX idx_destinations_order ON destinations(trip_id, order_index);
    `,
    down: `DROP TABLE IF EXISTS destinations;`
  },
  {
    id: '005',
    name: 'create_migration_history_table',
    up: `
      CREATE TABLE IF NOT EXISTS migration_history (
        id VARCHAR(10) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `,
    down: `DROP TABLE IF EXISTS migration_history;`
  },
  {
    id: '006',
    name: 'create_chat_system_tables',
    up: `
      -- Chat rooms table
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_default BOOLEAN DEFAULT FALSE,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX idx_chat_rooms_trip_id ON chat_rooms(trip_id);
      CREATE INDEX idx_chat_rooms_created_by ON chat_rooms(created_by);
      
      -- Chat messages table
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        message_type VARCHAR(50) DEFAULT 'text',
        metadata JSONB DEFAULT '{}',
        replied_to UUID REFERENCES chat_messages(id),
        edited_at TIMESTAMP WITH TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX idx_chat_messages_room_id_created_at ON chat_messages(room_id, created_at DESC);
      CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
      CREATE INDEX idx_chat_messages_type ON chat_messages(message_type);
      
      -- Chat room members table
      CREATE TABLE IF NOT EXISTS chat_room_members (
        room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        role VARCHAR(50) DEFAULT 'member',
        permissions JSONB DEFAULT '["read", "write"]',
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        notification_enabled BOOLEAN DEFAULT TRUE,
        PRIMARY KEY (room_id, user_id)
      );
      
      CREATE INDEX idx_room_members_user_id ON chat_room_members(user_id);
    `,
    down: `
      DROP TABLE IF EXISTS chat_room_members;
      DROP TABLE IF EXISTS chat_messages;
      DROP TABLE IF EXISTS chat_rooms;
    `
  },
  {
    id: '007',
    name: 'create_voting_system_tables',
    up: `
      -- Votes table
      CREATE TABLE IF NOT EXISTS votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        chat_message_id UUID REFERENCES chat_messages(id),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        vote_type VARCHAR(50) NOT NULL,
        options JSONB NOT NULL,
        settings JSONB DEFAULT '{}',
        creator_id UUID NOT NULL REFERENCES users(id),
        deadline TIMESTAMP WITH TIME ZONE,
        status VARCHAR(50) DEFAULT 'active',
        result_summary JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX idx_votes_trip_id ON votes(trip_id);
      CREATE INDEX idx_votes_status_deadline ON votes(status, deadline);
      CREATE INDEX idx_votes_creator_id ON votes(creator_id);
      
      -- Vote responses table
      CREATE TABLE IF NOT EXISTS vote_responses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vote_id UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        selected_options JSONB NOT NULL,
        ranking JSONB,
        comment TEXT,
        is_anonymous BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(vote_id, user_id)
      );
      
      CREATE INDEX idx_vote_responses_vote_id ON vote_responses(vote_id);
      CREATE INDEX idx_vote_responses_user_id ON vote_responses(user_id);
    `,
    down: `
      DROP TABLE IF EXISTS vote_responses;
      DROP TABLE IF EXISTS votes;
    `
  },
  {
    id: '008',
    name: 'create_expense_management_system',
    up: `
      -- Create updated_at trigger function
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql';

      -- Create budgets table
      CREATE TABLE IF NOT EXISTS budgets (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        total_amount DECIMAL(12,2) NOT NULL CHECK (total_amount > 0),
        currency VARCHAR(3) NOT NULL,
        category_limits JSONB DEFAULT '{}',
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Create expenses table
      CREATE TABLE IF NOT EXISTS expenses (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
        currency VARCHAR(3) NOT NULL,
        category VARCHAR(100) NOT NULL,
        subcategory VARCHAR(100),
        tags TEXT[], -- Array of tags
        payer_id UUID NOT NULL REFERENCES users(id),
        expense_date TIMESTAMP WITH TIME ZONE NOT NULL,
        receipt_url TEXT,
        is_reimbursable BOOLEAN DEFAULT true,
        split_method VARCHAR(20) NOT NULL DEFAULT 'equal' 
          CHECK (split_method IN ('equal', 'exact', 'percentage', 'shares')),
        split_data JSONB DEFAULT '{}', -- Stores split calculations
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Create expense_splits table for tracking individual splits
      CREATE TABLE IF NOT EXISTS expense_splits (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        amount DECIMAL(12,2) NOT NULL,
        percentage DECIMAL(5,2), -- For percentage splits
        shares INTEGER, -- For share-based splits
        is_settled BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        UNIQUE(expense_id, user_id)
      );

      -- Create settlements table for tracking debt resolution
      CREATE TABLE IF NOT EXISTS settlements (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        from_user_id UUID NOT NULL REFERENCES users(id),
        to_user_id UUID NOT NULL REFERENCES users(id),
        amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
        currency VARCHAR(3) NOT NULL,
        description TEXT,
        settled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        CHECK (from_user_id != to_user_id)
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_budgets_trip_id ON budgets(trip_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses(trip_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_payer_id ON expenses(payer_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
      CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
      CREATE INDEX IF NOT EXISTS idx_expense_splits_expense_id ON expense_splits(expense_id);
      CREATE INDEX IF NOT EXISTS idx_expense_splits_user_id ON expense_splits(user_id);
      CREATE INDEX IF NOT EXISTS idx_settlements_trip_id ON settlements(trip_id);
      CREATE INDEX IF NOT EXISTS idx_settlements_from_user ON settlements(from_user_id);
      CREATE INDEX IF NOT EXISTS idx_settlements_to_user ON settlements(to_user_id);

      -- Apply triggers to tables
      CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON budgets 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_expense_splits_updated_at BEFORE UPDATE ON expense_splits 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `,
    down: `
      DROP TRIGGER IF EXISTS update_expense_splits_updated_at ON expense_splits;
      DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
      DROP TRIGGER IF EXISTS update_budgets_updated_at ON budgets;
      DROP TABLE IF EXISTS settlements;
      DROP TABLE IF EXISTS expense_splits;
      DROP TABLE IF EXISTS expenses;
      DROP TABLE IF EXISTS budgets;
      DROP FUNCTION IF EXISTS update_updated_at_column();
    `
  }
];

export const runMigrations = async (): Promise<void> => {
  const db = getDatabase();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Ensure migration_history table exists
    await client.query(migrations[4].up);

    // Get executed migrations
    const result = await client.query('SELECT id FROM migration_history ORDER BY id');
    const executedMigrations = new Set(result.rows.map(row => row.id));

    // Run pending migrations
    for (const migration of migrations.slice(0, 8)) { // Include the new migration
      if (!executedMigrations.has(migration.id)) {
        console.log(`Running migration ${migration.id}: ${migration.name}`);
        await client.query(migration.up);
        await client.query(
          'INSERT INTO migration_history (id, name) VALUES ($1, $2)',
          [migration.id, migration.name]
        );
        console.log(`Migration ${migration.id} completed`);
      }
    }

    await client.query('COMMIT');
    console.log('All migrations completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const rollbackMigration = async (migrationId: string): Promise<void> => {
  const db = getDatabase();
  const client = await db.connect();

  try {
    const migration = migrations.find(m => m.id === migrationId);
    if (!migration) {
      throw new Error(`Migration ${migrationId} not found`);
    }

    await client.query('BEGIN');
    await client.query(migration.down);
    await client.query('DELETE FROM migration_history WHERE id = $1', [migrationId]);
    await client.query('COMMIT');

    console.log(`Migration ${migrationId} rolled back successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
};