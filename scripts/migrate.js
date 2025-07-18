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
const migrations_1 = require("../src/lib/migrations");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Starting database migration...');
        try {
            // Test database connection first
            const connected = yield (0, migrations_1.testConnection)();
            if (!connected) {
                console.error('Database connection failed. Please check your configuration.');
                process.exit(1);
            }
            // Run migrations
            yield (0, migrations_1.runMigrations)();
            console.log('Migration completed successfully!');
            process.exit(0);
        }
        catch (error) {
            console.error('Migration failed:', error);
            process.exit(1);
        }
    });
}
if (require.main === module) {
    main();
}
