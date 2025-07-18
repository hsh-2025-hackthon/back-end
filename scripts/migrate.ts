#!/usr/bin/env ts-node

import { runMigrations, testConnection } from '../src/lib/migrations';

async function main() {
  console.log('Starting database migration...');
  
  try {
    // Test database connection first
    const connected = await testConnection();
    if (!connected) {
      console.error('Database connection failed. Please check your configuration.');
      process.exit(1);
    }
    
    // Run migrations
    await runMigrations();
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}