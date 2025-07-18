"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseTestHelper = void 0;
exports.setupTestDatabase = setupTestDatabase;
exports.cleanupTestDatabase = cleanupTestDatabase;
exports.createTestUser = createTestUser;
exports.createTestTrip = createTestTrip;
const pg_1 = require("pg");
const testcontainers_1 = require("testcontainers");
class DatabaseTestHelper {
    constructor() { }
    static getInstance() {
        if (!DatabaseTestHelper.instance) {
            DatabaseTestHelper.instance = new DatabaseTestHelper();
        }
        return DatabaseTestHelper.instance;
    }
    startContainer() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.container) {
                return;
            }
            this.container = yield new testcontainers_1.GenericContainer('postgres:15')
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
            this.pool = new pg_1.Pool({
                host,
                port,
                database: 'test_db',
                user: 'test_user',
                password: 'test_password',
            });
            // Wait for connection to be ready
            yield this.pool.query('SELECT 1');
        });
    }
    stopContainer() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.pool) {
                yield this.pool.end();
                this.pool = undefined;
            }
            if (this.container) {
                yield this.container.stop();
                this.container = undefined;
            }
        });
    }
    getPool() {
        if (!this.pool) {
            throw new Error('Database container not started. Call startContainer() first.');
        }
        return this.pool;
    }
    setupTables() {
        return __awaiter(this, void 0, void 0, function* () {
            const pool = this.getPool();
            // Create users table
            yield pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        google_id VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
            // Create trips table
            yield pool.query(`
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
            yield pool.query(`
      CREATE TABLE IF NOT EXISTS trip_collaborators (
        trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (trip_id, user_id)
      )
    `);
            // Create indexes
            yield pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
      CREATE INDEX IF NOT EXISTS idx_trips_user_id ON trips(user_id);
      CREATE INDEX IF NOT EXISTS idx_trip_collaborators_trip_id ON trip_collaborators(trip_id);
      CREATE INDEX IF NOT EXISTS idx_trip_collaborators_user_id ON trip_collaborators(user_id);
    `);
        });
    }
    cleanupTables() {
        return __awaiter(this, void 0, void 0, function* () {
            const pool = this.getPool();
            yield pool.query('DELETE FROM trip_collaborators');
            yield pool.query('DELETE FROM trips');
            yield pool.query('DELETE FROM users');
        });
    }
    seedTestData() {
        return __awaiter(this, void 0, void 0, function* () {
            const pool = this.getPool();
            // Insert test users
            const userResult = yield pool.query(`
      INSERT INTO users (email, name, google_id) VALUES
      ('user1@test.com', 'Test User 1', 'google-1'),
      ('user2@test.com', 'Test User 2', 'google-2'),
      ('user3@test.com', 'Test User 3', 'google-3')
      RETURNING *
    `);
            const users = userResult.rows;
            // Insert test trips
            const tripResult = yield pool.query(`
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
            yield pool.query(`
      INSERT INTO trip_collaborators (trip_id, user_id) VALUES
      ($1, $2),
      ($3, $4)
    `, [trips[0].id, users[1].id, trips[1].id, users[2].id]);
            return { users, trips };
        });
    }
    executeQuery(query, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const pool = this.getPool();
            return pool.query(query, params);
        });
    }
    getConnectionInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.container) {
                throw new Error('Database container not started');
            }
            return {
                host: this.container.getHost(),
                port: this.container.getMappedPort(5432),
                database: 'test_db'
            };
        });
    }
}
exports.DatabaseTestHelper = DatabaseTestHelper;
// Helper function for test setup
function setupTestDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        const dbHelper = DatabaseTestHelper.getInstance();
        yield dbHelper.startContainer();
        yield dbHelper.setupTables();
        return dbHelper;
    });
}
// Helper function for test cleanup
function cleanupTestDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        const dbHelper = DatabaseTestHelper.getInstance();
        yield dbHelper.cleanupTables();
        yield dbHelper.stopContainer();
    });
}
// Helper function for creating test data
function createTestUser() {
    return __awaiter(this, arguments, void 0, function* (data = {}) {
        const dbHelper = DatabaseTestHelper.getInstance();
        const pool = dbHelper.getPool();
        const userData = {
            email: data.email || `test-${Date.now()}@example.com`,
            name: data.name || 'Test User',
            google_id: data.google_id || `google-${Date.now()}`
        };
        const result = yield pool.query('INSERT INTO users (email, name, google_id) VALUES ($1, $2, $3) RETURNING *', [userData.email, userData.name, userData.google_id]);
        return result.rows[0];
    });
}
function createTestTrip(userId_1) {
    return __awaiter(this, arguments, void 0, function* (userId, data = {}) {
        const dbHelper = DatabaseTestHelper.getInstance();
        const pool = dbHelper.getPool();
        const tripData = {
            name: data.name || 'Test Trip',
            user_id: userId,
            destinations: data.destinations || [{ name: 'Test City', country: 'Test Country' }],
            start_date: data.start_date || '2024-06-01',
            end_date: data.end_date || '2024-06-15'
        };
        const result = yield pool.query('INSERT INTO trips (name, user_id, destinations, start_date, end_date) VALUES ($1, $2, $3, $4, $5) RETURNING *', [tripData.name, tripData.user_id, JSON.stringify(tripData.destinations), tripData.start_date, tripData.end_date]);
        return result.rows[0];
    });
}
