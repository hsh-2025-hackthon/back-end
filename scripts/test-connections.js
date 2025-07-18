#!/usr/bin/env ts-node
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
const database_1 = require("../src/config/database");
const cosmos_1 = require("../src/lib/cosmos");
const keyvault_1 = require("../src/lib/keyvault");
function testAllConnections() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Testing all Azure service connections...\n');
        // Test PostgreSQL connection
        console.log('1. Testing PostgreSQL connection...');
        try {
            const pgConnected = yield (0, database_1.testConnection)();
            console.log(`   PostgreSQL: ${pgConnected ? '✅ Connected' : '❌ Failed'}\n`);
        }
        catch (error) {
            console.log(`   PostgreSQL: ❌ Failed - ${error}\n`);
        }
        // Test Cosmos DB connection
        console.log('2. Testing Cosmos DB connection...');
        try {
            const cosmosConnected = yield (0, cosmos_1.testCosmosConnection)();
            console.log(`   Cosmos DB: ${cosmosConnected ? '✅ Connected' : '❌ Failed'}\n`);
        }
        catch (error) {
            console.log(`   Cosmos DB: ❌ Failed - ${error}\n`);
        }
        // Test Key Vault connection
        console.log('3. Testing Key Vault connection...');
        try {
            const kvConnected = yield (0, keyvault_1.testKeyVaultConnection)();
            console.log(`   Key Vault: ${kvConnected ? '✅ Connected' : '❌ Failed'}\n`);
        }
        catch (error) {
            console.log(`   Key Vault: ❌ Failed - ${error}\n`);
        }
        console.log('Connection tests completed!');
        console.log('\nNote: Failed connections may be due to missing environment variables or placeholder values.');
        console.log('Update your environment variables with actual Azure service connection strings.');
    });
}
if (require.main === module) {
    testAllConnections().then(() => process.exit(0)).catch(() => process.exit(1));
}
