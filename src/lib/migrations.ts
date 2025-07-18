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
    for (const migration of migrations.slice(0, 4)) { // Skip migration_history creation
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