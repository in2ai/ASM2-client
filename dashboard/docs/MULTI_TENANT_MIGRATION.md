# Multi-Tenant Database Migration Guide

This guide explains how to use the multi-tenant database migration script to set up or migrate your ACM2 Central database for multi-tenant support.

## Overview

The migration script (`scripts/setup-multi-tenant.ts`) performs the following operations:

1. **Creates database indexes** for efficient multi-tenant queries
2. **Migrates existing metrics** that don't have a `nodeId` assigned
3. **Seeds Node documents** from existing metrics or WorkOS organizations
4. **Provides verification** to check the current database state
5. **Supports rollback** to undo migration changes

## Prerequisites

- MongoDB connection configured in `.env`
- Bun runtime installed
- Database backup (recommended before running migration)

## Usage

### Run Full Migration

This will create indexes, migrate metrics, and seed nodes:

```bash
bun run migrate:multi-tenant
```

Or directly:

```bash
bun run scripts/setup-multi-tenant.ts
```

### Verify Database State

Check the current state without making any changes:

```bash
bun run migrate:verify
```

Or:

```bash
bun run scripts/setup-multi-tenant.ts --verify-only
```

This will show:
- Total metrics and how many have `nodeId`
- Current database indexes
- Existing nodes and their details
- Any warnings about data that needs migration

### Dry Run

See what would be done without making actual changes:

```bash
bun run scripts/setup-multi-tenant.ts --dry-run
```

### Rollback Migration

Remove nodes and drop multi-tenant indexes:

```bash
bun run migrate:rollback
```

Or:

```bash
bun run scripts/setup-multi-tenant.ts --rollback
```

**⚠️ WARNING:** This will delete all Node documents and drop indexes. Use with caution!

## Migration Process

### Step 1: Create Indexes

The script creates the following indexes:

**RAGMetric Collection:**
- `nodeId_1` - Single field index for node filtering
- `timestamp_-1` - Descending timestamp for time-based queries
- `nodeId_1_timestamp_-1` - Compound index for node-specific time queries

**Node Collection:**
- `nodeId_1` - Unique index for node identifier
- `workosOrganizationId_1` - Unique index for WorkOS organization mapping

### Step 2: Migrate Metrics Without NodeId

If any metrics exist without a `nodeId` field (or with null/empty values), they will be assigned a default `nodeId` of `"default"`.

A corresponding Node document will be created:
```typescript
{
  nodeId: "default",
  name: "Default Organization",
  workosOrganizationId: "org_default",
  isActive: true
}
```

### Step 3: Seed Nodes from Metrics

The script extracts unique `nodeId` values from existing metrics and creates corresponding Node documents:

```typescript
{
  nodeId: "node123",
  name: "Company node123",  // Placeholder
  workosOrganizationId: "org_node123",  // Placeholder
  isActive: true
}
```

**Important:** The script uses placeholder names and WorkOS organization IDs. You must update these with actual values before going to production.

### Step 4: Verification

After migration, the script verifies:
- All indexes were created successfully
- All metrics have valid `nodeId` values
- Node documents exist for all unique `nodeId` values
- Indexes are properly configured

## Post-Migration Steps

### 1. Update Node Information

After migration, update the placeholder node information with actual data:

```typescript
// Example: Update node with actual company information
await Node.findOneAndUpdate(
  { nodeId: "node123" },
  {
    name: "Acme Corporation",
    workosOrganizationId: "org_01HXYZ123ABC",  // Actual WorkOS org ID
  }
);
```

### 2. Map WorkOS Organizations

Ensure each Node's `workosOrganizationId` matches the actual WorkOS organization ID:

1. Get organization IDs from WorkOS dashboard
2. Update each Node document with the correct mapping
3. Verify users can authenticate and see their organization's data

### 3. Verify Data Isolation

Test that users can only access their own organization's data:

```bash
# Run verification
bun run migrate:verify

# Check a specific node's metrics
# In MongoDB shell:
db.ragmetrics.find({ nodeId: "node123" }).count()
```

### 4. Test Authentication Flow

1. Sign in as an end user
2. Verify you only see your organization's data
3. Sign in as an administrator
4. Verify you can switch between nodes and see all data

## Troubleshooting

### Metrics Without NodeId

If you see warnings about metrics without `nodeId`:

```
⚠️  WARNING: 150 metrics found without nodeId
```

The migration will automatically assign them to the "default" node. If you need different behavior:

1. Manually assign `nodeId` values before running migration
2. Or update them after migration using MongoDB queries

### Duplicate WorkOS Organization IDs

If you get errors about duplicate `workosOrganizationId`:

```
Error: E11000 duplicate key error collection: acm2.nodes index: workosOrganizationId_1
```

This means multiple nodes are trying to use the same WorkOS organization ID. Update the placeholder IDs to be unique.

### Index Creation Failures

If index creation fails:

```
❌ Failed to create indexes: Index already exists with different options
```

Drop the existing indexes manually and re-run the migration:

```javascript
// In MongoDB shell
db.ragmetrics.dropIndex("nodeId_1");
db.ragmetrics.dropIndex("nodeId_1_timestamp_-1");
```

Then run:
```bash
bun run migrate:multi-tenant
```

### Rollback Issues

If rollback fails, you can manually clean up:

```javascript
// In MongoDB shell
// Drop indexes
db.ragmetrics.dropIndex("nodeId_1");
db.ragmetrics.dropIndex("nodeId_1_timestamp_-1");

// Delete all nodes
db.nodes.deleteMany({});
```

## Migration Checklist

Before running migration:
- [ ] Backup your database
- [ ] Review current data with `--verify-only`
- [ ] Test with `--dry-run` first
- [ ] Ensure MongoDB connection is working

After running migration:
- [ ] Verify indexes were created
- [ ] Check all metrics have `nodeId`
- [ ] Update node names with actual company names
- [ ] Map WorkOS organization IDs correctly
- [ ] Test authentication and authorization
- [ ] Verify data isolation between organizations
- [ ] Test admin node switching functionality

## Example Workflow

```bash
# 1. Check current state
bun run migrate:verify

# 2. Test migration without changes
bun run scripts/setup-multi-tenant.ts --dry-run

# 3. Run actual migration
bun run migrate:multi-tenant

# 4. Verify results
bun run migrate:verify

# 5. Update node information (in your application code)
# See "Post-Migration Steps" above

# 6. If something goes wrong, rollback
bun run migrate:rollback
```

## Database Schema Changes

### Before Migration

```typescript
// RAGMetric
{
  nodeId: string,  // May be missing or null
  usage_metrics: {...},
  timestamp: Date,
  // ... other fields
}

// No Node collection
```

### After Migration

```typescript
// RAGMetric (with indexes)
{
  nodeId: string,  // Required, indexed
  usage_metrics: {...},
  timestamp: Date,  // Indexed
  // ... other fields
}
// Indexes: nodeId_1, timestamp_-1, nodeId_1_timestamp_-1

// Node collection (new)
{
  nodeId: string,  // Unique, indexed
  name: string,
  workosOrganizationId: string,  // Unique, indexed
  isActive: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## Support

If you encounter issues not covered in this guide:

1. Check the script output for detailed error messages
2. Run verification to see the current state
3. Review MongoDB logs for database-level errors
4. Ensure all environment variables are correctly set

## Related Documentation

- [Environment Setup](./ENVIRONMENT_SETUP.md)
- [WorkOS Authentication Setup](../README.md#authentication)
- [Multi-Tenant Architecture](../.kiro/specs/multi-tenant-analytics-dashboard/design.md)
