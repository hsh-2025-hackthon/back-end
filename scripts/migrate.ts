#!/usr/bin/env ts-node

import { runMigrations } from '../src/lib/migrations';

async function main() {
  console.log('Starting database migration...');
  
  try {
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