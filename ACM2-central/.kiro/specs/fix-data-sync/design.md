# Design Document

## Overview

This design addresses the data synchronization issue between the nodes and ragmetrics collections. The root cause is that the seed data creates nodes with test IDs ("node-1", "node-2", "node-3") but the API expects to match these against WorkOS organization IDs from the authentication context. The solution involves updating the seed scripts to create properly aligned test data and optionally adding a setup script for development environments.

## Architecture

### Current State

```
Authentication Context (WorkOS)
  ↓
  organizationId: "org_xyz123"
  ↓
API Router (metrics.ts)
  ↓
  Query: { nodeId: "org_xyz123" }
  ↓
RAGMetrics Collection
  Documents: { nodeId: "node-1" }  ← MISMATCH!
```

### Proposed State

```
Authentication Context (WorkOS)
  ↓
  organizationId: "org_test_1"
  ↓
API Router (metrics.ts)
  ↓
  Query: { nodeId: "org_test_1" }
  ↓
RAGMetrics Collection
  Documents: { nodeId: "org_test_1" }  ← MATCH!
  
Nodes Collection
  Documents: { 
    nodeId: "org_test_1",
    workosOrganizationId: "org_test_1"
  }
```

## Components and Interfaces

### 1. Updated Seed Data (metrics-seed-data.json)

**Purpose**: Provide test metrics data with nodeId values that align with test WorkOS organization IDs

**Changes**:
- Replace `nodeId: "node-1"` with `nodeId: "org_test_1"`
- Replace `nodeId: "node-2"` with `nodeId: "org_test_2"`  
- Replace `nodeId: "node-3"` with `nodeId: "org_test_3"`

**Rationale**: Using "org_" prefix matches WorkOS organization ID format and makes it clear these are organization identifiers

### 2. Updated Seed Nodes Script (seed-nodes.ts)

**Purpose**: Create Node documents that correspond to the metrics data

**Interface**:
```typescript
interface NodeSeedData {
  nodeId: string;
  name: string;
  workosOrganizationId: string;
  isActive: boolean;
}

async function seedNodes(): Promise<Result<number, Error>>
```

**Implementation Details**:
- Create three test nodes with IDs: "org_test_1", "org_test_2", "org_test_3"
- Assign descriptive names: "Test Organization 1", "Test Organization 2", "Test Organization 3"
- Set workosOrganizationId to match nodeId for test environments
- Set all nodes as active (isActive: true)
- Use upsert logic to avoid duplicates on repeated runs

### 3. Enhanced Main Seed Script (seed.ts)

**Purpose**: Orchestrate seeding of both metrics and nodes

**Changes**:
- Import and call the seedNodes function
- Ensure nodes are seeded before metrics (to maintain referential integrity)
- Add error handling for node seeding failures
- Log summary of both nodes and metrics created

**Execution Order**:
1. Connect to database
2. Clear existing data (optional, based on flags)
3. Seed nodes first
4. Seed metrics second
5. Create/verify indexes
6. Disconnect from database

### 4. Development Environment Setup Documentation

**Purpose**: Guide developers on setting up test authentication

**Content**:
- Instructions for configuring WorkOS test organizations
- How to obtain test organization IDs
- Environment variable configuration
- Testing authentication with test users

## Data Models

### Node Document Structure

```typescript
{
  _id: ObjectId,
  nodeId: "org_test_1",           // Matches WorkOS org ID format
  name: "Test Organization 1",     // Human-readable name
  workosOrganizationId: "org_test_1", // Same as nodeId for test env
  isActive: true,
  createdAt: Date,
  updatedAt: Date
}
```

### RAGMetric Document Structure (Updated)

```typescript
{
  _id: ObjectId,
  nodeId: "org_test_1",           // Now matches Node.nodeId
  usage_metrics: { ... },
  rag_quality_metrics: { ... },
  performance_metrics: { ... },
  extra_analytics: { ... },
  alerts: { ... },
  timestamp: Date,
  createdAt: Date,
  updatedAt: Date
}
```

## Error Handling

### Scenario 1: No Metrics Found for User's Organization

**Current Behavior**: Returns generic "No metrics data found" error

**Improved Behavior**:
- Check if the user's organizationId exists in the nodes collection
- If node exists but no metrics: "No metrics data available for your organization yet"
- If node doesn't exist: "Your organization is not configured in the system. Please contact support."

### Scenario 2: Seed Script Failures

**Handling**:
- Wrap each seeding operation in try-catch
- Use Result type pattern for error propagation
- Log specific errors for debugging
- Provide rollback capability if partial seeding occurs

### Scenario 3: Mismatched Data During Migration

**Handling**:
- Add validation step in setup-multi-tenant.ts
- Check for orphaned metrics (metrics without corresponding nodes)
- Check for empty nodes (nodes without any metrics)
- Provide warnings and suggestions for data cleanup

## Testing Strategy

### Unit Tests

**Not required for this fix** - Focus on integration testing with real database

### Integration Tests

**Scope**: Test the complete flow from seed scripts to API queries

**Test Cases**:

1. **Seed Script Execution**
   - Verify nodes are created with correct IDs
   - Verify metrics reference valid node IDs
   - Verify indexes are created properly

2. **User Query Flow**
   - Mock authentication context with test org ID
   - Query metrics endpoint
   - Verify correct metrics are returned
   - Verify metadata includes correct nodeId

3. **Admin Query Flow**
   - Mock admin authentication context
   - Query metrics without nodeId (all nodes)
   - Query metrics with specific nodeId
   - Verify correct filtering behavior

4. **Error Scenarios**
   - Query with non-existent organization ID
   - Query with empty database
   - Verify appropriate error messages

### Manual Testing

**Steps**:
1. Run seed scripts: `bun run scripts/seed.ts` and `bun run scripts/seed-nodes.ts`
2. Verify data in MongoDB Compass
3. Start development server
4. Test authentication with test user
5. Verify metrics dashboard loads correctly
6. Test admin view with node selection

## Migration Path

### For Development Environments

1. Update metrics-seed-data.json with new nodeId values
2. Update seed-nodes.ts to create matching nodes
3. Run seed scripts to populate database
4. Configure test WorkOS organizations with matching IDs
5. Test authentication and data access

### For Production Environments

**Note**: This fix primarily affects development/test data. Production should already have proper WorkOS organization IDs.

**If production has mismatched data**:
1. Run audit script to identify mismatches
2. Create mapping between old nodeIds and WorkOS org IDs
3. Run migration script to update nodeId values in metrics
4. Verify nodes collection has correct workosOrganizationId values
5. Test with sample users from each organization

## Performance Considerations

### Database Indexes

**Existing Indexes** (already defined in models):
- RAGMetric: `{ nodeId: 1 }`
- RAGMetric: `{ timestamp: -1 }`
- RAGMetric: `{ nodeId: 1, timestamp: -1 }`
- Node: `{ nodeId: 1 }` (unique)
- Node: `{ workosOrganizationId: 1 }` (unique)

**Impact**: No additional indexes needed. Existing indexes support efficient queries.

### Query Performance

**Current Query Pattern**:
```typescript
RAGMetric.find({ nodeId: ctx.userContext.organizationId })
  .sort({ timestamp: -1 })
  .limit(100)
  .lean()
```

**Performance**: Excellent - uses compound index `{ nodeId: 1, timestamp: -1 }`

### Seed Script Performance

**Considerations**:
- Use `insertMany` for bulk inserts (already implemented)
- Use `ordered: false` to continue on duplicate key errors
- Limit seed data to reasonable size (currently 5 documents - good)

## Security Considerations

### Authorization

**Current Implementation**: Already correct
- End users can only query their own organization's data
- Admins can query any organization or all organizations
- Role-based filtering applied at API layer

**No Changes Needed**: The fix maintains existing security model

### Data Isolation

**Verification**:
- Each RAGMetric document is tied to exactly one nodeId
- API enforces nodeId filtering based on user context
- No cross-organization data leakage possible

## Alternative Approaches Considered

### Alternative 1: Map nodeId to organizationId in API Layer

**Approach**: Keep test data as-is, add mapping logic in API

**Pros**: No data changes needed

**Cons**: 
- Adds complexity to API layer
- Mapping logic needed in multiple places
- Doesn't solve root cause
- Confusing for developers

**Decision**: Rejected - fixing data is cleaner

### Alternative 2: Use Separate Test Database

**Approach**: Maintain separate database for development with different data

**Pros**: Production data unaffected

**Cons**:
- Requires maintaining two data sets
- Doesn't help with local development
- Adds deployment complexity

**Decision**: Rejected - single database with proper test data is simpler

### Alternative 3: Dynamic Node Creation on First Login

**Approach**: Auto-create nodes when users first authenticate

**Pros**: No manual setup needed

**Cons**:
- Doesn't help with seed data
- Requires additional logic
- Doesn't solve immediate problem

**Decision**: Rejected for this fix, but could be future enhancement
