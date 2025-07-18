# Database Migrations

This project uses a unified migration system that supports both code-based and SQL file-based migrations.

## Migration Types

### 1. Code-based Migrations
- Located in `src/lib/migrations.ts`
- Written in TypeScript with up/down functions
- Good for complex logic and data transformations

### 2. SQL File Migrations
- Located in `scripts/migrations/` directory
- Pure SQL files numbered sequentially (001_, 002_, etc.)
- Good for schema changes and bulk data operations
- Tracked with checksums for integrity

## Usage

```bash
# Run all migrations (both code and SQL)
npm run migrate

# Run only SQL file migrations
npm run migrate:sql

# Run only code-based migrations  
npm run migrate:code

# Run all migrations explicitly
npm run migrate:all

# Check migration status
npm run migrate:status

# Test database connection
npm run test:connection
```

## Migration Order

1. Code-based migrations run first (from `src/lib/migrations.ts`)
2. SQL file migrations run second (from `scripts/migrations/*.sql`)

## SQL Migration Files

Current SQL migrations:
- `001_create_users_table.sql` - User accounts and authentication
- `002_create_trips_and_destinations.sql` - Core trip management
- `003_create_chat_system.sql` - Real-time communication
- `004_create_voting_system.sql` - Group decision making
- `005_create_expense_system.sql` - Expense tracking and splitting
- `006_create_itinerary_system.sql` - Detailed trip planning
- `007_create_system_tables.sql` - Notifications, files, audit logs
- `008_create_views_and_functions.sql` - Helper views and stored procedures
- `009_insert_default_data_and_procedures.sql` - Default data and triggers

## Environment Variables

```bash
# Database connection (uses POSTGRES_* or DB_* variables)
DB_HOST=localhost          # or POSTGRES_HOST
DB_PORT=5432              # or POSTGRES_PORT  
DB_NAME=travel_planner    # or POSTGRES_DB
DB_USER=postgres          # or POSTGRES_USER
DB_PASSWORD=password      # or POSTGRES_PASSWORD
```

## Migration Tracking

- Code migrations: Tracked in `migrations` table
- SQL migrations: Tracked in `schema_migrations` table with checksums
- Migrations are idempotent - safe to run multiple times
- Changed SQL files will be re-executed (based on checksum)

## Adding New Migrations

### Code Migration
Add to the `migrations` array in `src/lib/migrations.ts`:

```typescript
{
  id: '003',
  name: 'add_new_feature',
  up: `ALTER TABLE users ADD COLUMN new_field VARCHAR(255);`,
  down: `ALTER TABLE users DROP COLUMN new_field;`
}
```

### SQL Migration
Create a new file in `scripts/migrations/`:

```sql
-- 010_add_new_feature.sql
ALTER TABLE users ADD COLUMN new_field VARCHAR(255);
CREATE INDEX idx_users_new_field ON users(new_field);
```

## Best Practices

1. **Always backup** before running migrations in production
2. **Test migrations** in development environment first
3. **Use transactions** for atomic operations
4. **Include rollback plans** for code migrations
5. **Number SQL files** sequentially with descriptive names
6. **Review migration status** before and after running
7. **Use descriptive comments** in SQL migrations
