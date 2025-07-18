#!/usr/bin/env ts-node

import { runMigrations } from '../src/lib/migrations';
import { getDatabase } from '../src/config/database';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Database configuration
const config = {
  host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432'),
  database: process.env.DB_NAME || process.env.POSTGRES_DB || 'travel_planner',
  user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'password',
};

// Test database connection
async function testConnection(): Promise<boolean> {
  try {
    const db = getDatabase();
    const client = await db.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ Database connection successful');
    return true;
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Create a connection pool for SQL migrations
const pool = new Pool(config);

// Migration tracking table for SQL files
const createMigrationTable = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64) NOT NULL
  );
`;

// Calculate file checksum
function calculateChecksum(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Get list of SQL migration files
function getSqlMigrationFiles(): string[] {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('SQL migrations directory not found');
    return [];
  }
  
  return fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
}

// Check if SQL migration has been run
async function isSqlMigrationExecuted(client: any, filename: string): Promise<any> {
  const result = await client.query(
    'SELECT checksum FROM schema_migrations WHERE filename = $1',
    [filename]
  );
  return result.rows[0] || null;
}

// Record SQL migration execution
async function recordSqlMigration(client: any, filename: string, checksum: string): Promise<void> {
  await client.query(
    'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO UPDATE SET checksum = $2, executed_at = CURRENT_TIMESTAMP',
    [filename, checksum]
  );
}

// Execute a single SQL migration
async function executeSqlMigration(client: any, filename: string, content: string): Promise<boolean> {
  console.log(`Executing SQL migration: ${filename}`);
  
  try {
    // Execute the migration
    await client.query(content);
    
    // Record the migration
    const checksum = calculateChecksum(content);
    await recordSqlMigration(client, filename, checksum);
    
    console.log(`✅ SQL Migration ${filename} completed successfully`);
    return true;
  } catch (error: any) {
    console.error(`❌ SQL Migration ${filename} failed:`, error.message);
    throw error;
  }
}

// Run SQL migrations
async function runSqlMigrations(): Promise<void> {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting SQL migrations...');
    
    // Create migration tracking table
    await client.query(createMigrationTable);
    console.log('✅ Migration tracking table ready');
    
    // Get all migration files
    const migrationFiles = getSqlMigrationFiles();
    console.log(`📁 Found ${migrationFiles.length} SQL migration files`);
    
    if (migrationFiles.length === 0) {
      console.log('No SQL migrations to run');
      return;
    }
    
    // Process each migration
    let executedCount = 0;
    let skippedCount = 0;
    
    for (const filename of migrationFiles) {
      const filePath = path.join(__dirname, 'migrations', filename);
      const content = fs.readFileSync(filePath, 'utf8');
      const currentChecksum = calculateChecksum(content);
      
      // Check if migration has been executed
      const existingMigration = await isSqlMigrationExecuted(client, filename);
      
      if (existingMigration) {
        if (existingMigration.checksum === currentChecksum) {
          console.log(`⏭️  Skipping ${filename} (already executed)`);
          skippedCount++;
          continue;
        } else {
          console.log(`🔄 Re-executing ${filename} (checksum changed)`);
        }
      }
      
      // Execute the migration
      await executeSqlMigration(client, filename, content);
      executedCount++;
    }
    
    console.log('\n📊 SQL Migration Summary:');
    console.log(`   Executed: ${executedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Total: ${migrationFiles.length}`);
    
  } catch (error: any) {
    console.error('\n💥 SQL Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Check SQL migration status
async function checkSqlMigrationStatus(): Promise<void> {
  const client = await pool.connect();
  
  try {
    // Ensure migration table exists
    await client.query(createMigrationTable);
    
    const migrationFiles = getSqlMigrationFiles();
    const result = await client.query('SELECT filename, executed_at FROM schema_migrations ORDER BY executed_at');
    const executedMigrations = new Set(result.rows.map((row: any) => row.filename));
    
    console.log('\n📋 SQL Migration Status:');
    console.log('='.repeat(50));
    
    for (const filename of migrationFiles) {
      const status = executedMigrations.has(filename) ? '✅ Executed' : '❌ Pending';
      console.log(`${status.padEnd(12)} ${filename}`);
    }
    
    console.log('='.repeat(50));
    console.log(`Total migrations: ${migrationFiles.length}`);
    console.log(`Executed: ${executedMigrations.size}`);
    console.log(`Pending: ${migrationFiles.length - executedMigrations.size}`);
    
  } catch (error: any) {
    console.error('Error checking SQL migration status:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const command = process.argv[2];
  
  console.log('Starting database migration...');
  
  try {
    // Test database connection first
    const connected = await testConnection();
    if (!connected) {
      console.error('Database connection failed. Please check your configuration.');
      process.exit(1);
    }
    
    switch (command) {
      case 'sql':
        // Run only SQL file migrations
        await runSqlMigrations();
        break;
        
      case 'status':
        // Check SQL migration status
        await checkSqlMigrationStatus();
        break;
        
      case 'code':
        // Run only code-based migrations
        await runMigrations();
        break;
        
      case 'all':
      default:
        // Run both code-based and SQL migrations
        console.log('\n1️⃣ Running code-based migrations...');
        await runMigrations();
        
        console.log('\n2️⃣ Running SQL file migrations...');
        await runSqlMigrations();
        break;
    }
    
    console.log('\n🎉 All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}