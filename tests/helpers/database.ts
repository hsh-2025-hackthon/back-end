import { Pool } from 'pg';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

export class DatabaseTestHelper {
  private static instance: DatabaseTestHelper;
  private container?: StartedTestContainer;
  private pool?: Pool;

  private constructor() {}

  static getInstance(): DatabaseTestHelper {
    if (!DatabaseTestHelper.instance) {
      DatabaseTestHelper.instance = new DatabaseTestHelper();
    }
    return DatabaseTestHelper.instance;
  }

  async startContainer(): Promise<void> {
    if (this.container) {
      return;
    }

    this.container = await new GenericContainer('postgres:15')
      .withEnvironment({
        POSTGRES_DB: 'test_db',
        POSTGRES_USER: 'test_user',
        POSTGRES_PASSWORD: 'test_password'
      })
      .withExposedPorts(5432)
      .withWaitStrategy(wait => wait.forLogMessage('database system is ready to accept connections'))
      .start();

    const host = this.container.getHost();
    const port = this.container.getMappedPort(5432);

    this.pool = new Pool({
      host,
      port,
      database: 'test_db',
      user: 'test_user',
      password: 'test_password',
    });

    // Wait for connection to be ready
    await this.pool.query('SELECT 1');
  }

  async stopContainer(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }

    if (this.container) {
      await this.container.stop();
      this.container = undefined;
    }
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database container not started. Call startContainer() first.');
    }
    return this.pool;
  }

  async setupTables(): Promise<void> {
    const pool = this.getPool();
    
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        azure_ad_id VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create trips table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trips (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        destinations JSONB,
        start_date DATE,
        end_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create trip_collaborators table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trip_collaborators (
        trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (trip_id, user_id)
      )
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_azure_ad_id ON users(azure_ad_id);
      CREATE INDEX IF NOT EXISTS idx_trips_user_id ON trips(user_id);
      CREATE INDEX IF NOT EXISTS idx_trip_collaborators_trip_id ON trip_collaborators(trip_id);
      CREATE INDEX IF NOT EXISTS idx_trip_collaborators_user_id ON trip_collaborators(user_id);
    `);
  }

  async cleanupTables(): Promise<void> {
    const pool = this.getPool();
    
    await pool.query('DELETE FROM trip_collaborators');
    await pool.query('DELETE FROM trips');
    await pool.query('DELETE FROM users');
  }

  async seedTestData(): Promise<{ users: any[], trips: any[] }> {
    const pool = this.getPool();
    
    // Insert test users
    const userResult = await pool.query(`
      INSERT INTO users (email, name, azure_ad_id) VALUES
      ('user1@test.com', 'Test User 1', 'azure-1'),
      ('user2@test.com', 'Test User 2', 'azure-2'),
      ('user3@test.com', 'Test User 3', 'azure-3')
      RETURNING *
    `);

    const users = userResult.rows;

    // Insert test trips
    const tripResult = await pool.query(`
      INSERT INTO trips (name, user_id, destinations, start_date, end_date) VALUES
      ('Japan Trip', $1, $2, '2024-06-01', '2024-06-15'),
      ('Europe Tour', $2, $3, '2024-07-01', '2024-07-20'),
      ('USA Road Trip', $1, $4, '2024-08-01', '2024-08-10')
      RETURNING *
    `, [
      users[0].id,
      JSON.stringify([{ name: 'Tokyo', country: 'Japan' }, { name: 'Kyoto', country: 'Japan' }]),
      users[1].id,
      JSON.stringify([{ name: 'Paris', country: 'France' }, { name: 'Rome', country: 'Italy' }]),
      users[0].id,
      JSON.stringify([{ name: 'New York', country: 'USA' }, { name: 'Los Angeles', country: 'USA' }])
    ]);

    const trips = tripResult.rows;

    // Add collaborators
    await pool.query(`
      INSERT INTO trip_collaborators (trip_id, user_id) VALUES
      ($1, $2),
      ($3, $4)
    `, [trips[0].id, users[1].id, trips[1].id, users[2].id]);

    return { users, trips };
  }

  async executeQuery(query: string, params?: any[]): Promise<any> {
    const pool = this.getPool();
    return pool.query(query, params);
  }

  async getConnectionInfo(): Promise<{ host: string; port: number; database: string }> {
    if (!this.container) {
      throw new Error('Database container not started');
    }

    return {
      host: this.container.getHost(),
      port: this.container.getMappedPort(5432),
      database: 'test_db'
    };
  }
}

// Helper function for test setup
export async function setupTestDatabase(): Promise<DatabaseTestHelper> {
  const dbHelper = DatabaseTestHelper.getInstance();
  await dbHelper.startContainer();
  await dbHelper.setupTables();
  return dbHelper;
}

// Helper function for test cleanup
export async function cleanupTestDatabase(): Promise<void> {
  const dbHelper = DatabaseTestHelper.getInstance();
  await dbHelper.cleanupTables();
  await dbHelper.stopContainer();
}

// Helper function for creating test data
export async function createTestUser(data: Partial<any> = {}): Promise<any> {
  const dbHelper = DatabaseTestHelper.getInstance();
  const pool = dbHelper.getPool();
  
  const userData = {
    email: data.email || `test-${Date.now()}@example.com`,
    name: data.name || 'Test User',
    azure_ad_id: data.azure_ad_id || `azure-${Date.now()}`
  };

  const result = await pool.query(
    'INSERT INTO users (email, name, azure_ad_id) VALUES ($1, $2, $3) RETURNING *',
    [userData.email, userData.name, userData.azure_ad_id]
  );

  return result.rows[0];
}

export async function createTestTrip(userId: string, data: Partial<any> = {}): Promise<any> {
  const dbHelper = DatabaseTestHelper.getInstance();
  const pool = dbHelper.getPool();
  
  const tripData = {
    name: data.name || 'Test Trip',
    user_id: userId,
    destinations: data.destinations || [{ name: 'Test City', country: 'Test Country' }],
    start_date: data.start_date || '2024-06-01',
    end_date: data.end_date || '2024-06-15'
  };

  const result = await pool.query(
    'INSERT INTO trips (name, user_id, destinations, start_date, end_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [tripData.name, tripData.user_id, JSON.stringify(tripData.destinations), tripData.start_date, tripData.end_date]
  );

  return result.rows[0];
}