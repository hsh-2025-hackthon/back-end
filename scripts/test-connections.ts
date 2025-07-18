#!/usr/bin/env ts-node

import { testConnection } from '../src/config/database';
import { testCosmosConnection } from '../src/lib/cosmos';
import { testKeyVaultConnection } from '../src/lib/keyvault';

async function testAllConnections() {
  console.log('Testing all Azure service connections...\n');

  // Test PostgreSQL connection
  console.log('1. Testing PostgreSQL connection...');
  try {
    const pgConnected = await testConnection();
    console.log(`   PostgreSQL: ${pgConnected ? '✅ Connected' : '❌ Failed'}\n`);
  } catch (error) {
    console.log(`   PostgreSQL: ❌ Failed - ${error}\n`);
  }

  // Test Cosmos DB connection
  console.log('2. Testing Cosmos DB connection...');
  try {
    const cosmosConnected = await testCosmosConnection();
    console.log(`   Cosmos DB: ${cosmosConnected ? '✅ Connected' : '❌ Failed'}\n`);
  } catch (error) {
    console.log(`   Cosmos DB: ❌ Failed - ${error}\n`);
  }

  // Test Key Vault connection
  console.log('3. Testing Key Vault connection...');
  try {
    const kvConnected = await testKeyVaultConnection();
    console.log(`   Key Vault: ${kvConnected ? '✅ Connected' : '❌ Failed'}\n`);
  } catch (error) {
    console.log(`   Key Vault: ❌ Failed - ${error}\n`);
  }

  console.log('Connection tests completed!');
  console.log('\nNote: Failed connections may be due to missing environment variables or placeholder values.');
  console.log('Update your environment variables with actual Azure service connection strings.');
}

if (require.main === module) {
  testAllConnections().then(() => process.exit(0)).catch(() => process.exit(1));
}