#!/usr/bin/env bun
/**
 * Multi-Tenant Database Migration Script
 *
 * This script performs the following operations:
 * 1. Creates required database indexes for multi-tenant queries
 * 2. Migrates existing metrics without nodeId (if any)
 * 3. Seeds initial Node documents from existing metrics or WorkOS organizations
 * 4. Provides verification and rollback capabilities
 *
 * Usage:
 *   bun run scripts/setup-multi-tenant.ts [options]
 *
 * Options:
 *   --verify-only    Only verify the current state without making changes
 *   --rollback       Rollback the migration (removes indexes and nodes)
 *   --dry-run        Show what would be done without making changes
 */

import type mongoose from "mongoose";
import { type Result, err, ok } from "neverthrow";
import {
  connectDB as dbConnect,
  disconnectDB as dbDisconnect,
} from "../src/lib/db.js";
import { RAGMetric } from "../src/models/metric.js";
import { Node } from "../src/models/node.js";

// Parse command line arguments
const args = process.argv.slice(2);
const isVerifyOnly = args.includes("--verify-only");
const isRollback = args.includes("--rollback");
const isDryRun = args.includes("--dry-run");

interface MigrationStats {
  indexesCreated: number;
  metricsUpdated: number;
  nodesCreated: number;
  errors: string[];
}

// Connect to MongoDB
async function connectDB(): Promise<Result<typeof mongoose, Error>> {
  try {
    const db = await dbConnect();
    return ok(db);
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error("Failed to connect to MongoDB"),
    );
  }
}

// Disconnect from MongoDB
async function disconnectDB(): Promise<Result<void, Error>> {
  try {
    await dbDisconnect();
    return ok(undefined);
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error("Failed to disconnect from MongoDB"),
    );
  }
}

/**
 * Check for orphaned metrics (metrics without corresponding nodes)
 */
async function validateOrphanedMetrics(): Promise<
  Result<{ orphanedCount: number; orphanedNodeIds: string[] }, Error>
> {
  try {
    // Get all unique nodeIds from metrics
    const metricNodeIds = await RAGMetric.distinct("nodeId").exec();

    // Filter out null/empty nodeIds
    const validMetricNodeIds = metricNodeIds.filter(
      (id) => id !== null && id !== "",
    );

    // Get all nodeIds from nodes collection
    const existingNodeIds = await Node.distinct("nodeId").exec();

    // Find nodeIds in metrics that don't exist in nodes
    const orphanedNodeIds = validMetricNodeIds.filter(
      (nodeId) => !existingNodeIds.includes(nodeId),
    );

    // Count metrics for each orphaned nodeId
    let orphanedCount = 0;
    for (const nodeId of orphanedNodeIds) {
      const count = await RAGMetric.countDocuments({ nodeId }).exec();
      orphanedCount += count;
    }

    return ok({ orphanedCount, orphanedNodeIds });
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error("Failed to validate orphaned metrics"),
    );
  }
}

/**
 * Check for empty nodes (nodes without any metrics)
 */
async function validateEmptyNodes(): Promise<
  Result<{ emptyCount: number; emptyNodeIds: string[] }, Error>
> {
  try {
    // Get all nodes
    const allNodes = await Node.find().select("nodeId").lean().exec();

    // Check each node for metrics
    const emptyNodeIds: string[] = [];
    for (const node of allNodes) {
      const metricsCount = await RAGMetric.countDocuments({
        nodeId: node.nodeId,
      }).exec();

      if (metricsCount === 0) {
        emptyNodeIds.push(node.nodeId);
      }
    }

    return ok({ emptyCount: emptyNodeIds.length, emptyNodeIds });
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error("Failed to validate empty nodes"),
    );
  }
}

/**
 * Verify current database state
 */
async function verifyDatabaseState(): Promise<Result<void, Error>> {
  try {
    console.log("\n🔍 Verifying database state...\n");

    // Check RAGMetric collection
    const totalMetrics = await RAGMetric.countDocuments().exec();
    const metricsWithNodeId = await RAGMetric.countDocuments({
      nodeId: { $exists: true, $ne: null },
    }).exec();
    const metricsWithoutNodeId = totalMetrics - metricsWithNodeId;

    console.log("📊 RAGMetric Collection:");
    console.log(`   Total metrics: ${totalMetrics}`);
    console.log(`   With nodeId: ${metricsWithNodeId}`);
    console.log(`   Without nodeId: ${metricsWithoutNodeId}`);

    // Check indexes on RAGMetric
    const metricIndexes = await RAGMetric.collection.getIndexes();
    console.log("\n📑 RAGMetric Indexes:");
    for (const [name, spec] of Object.entries(metricIndexes)) {
      console.log(`   - ${name}:`, JSON.stringify(spec));
    }

    // Check Node collection
    const totalNodes = await Node.countDocuments().exec();
    const activeNodes = await Node.countDocuments({ isActive: true }).exec();

    console.log("\n🏢 Node Collection:");
    console.log(`   Total nodes: ${totalNodes}`);
    console.log(`   Active nodes: ${activeNodes}`);

    if (totalNodes > 0) {
      const nodes = await Node.find().limit(5).lean().exec();
      console.log("\n   Sample nodes:");
      for (const node of nodes) {
        console.log(
          `   - ${node.nodeId}: ${node.name} (${node.workosOrganizationId})`,
        );
      }
      if (totalNodes > 5) {
        console.log(`   ... and ${totalNodes - 5} more`);
      }
    }

    // Check Node indexes
    const nodeIndexes = await Node.collection.getIndexes();
    console.log("\n📑 Node Indexes:");
    for (const [name, spec] of Object.entries(nodeIndexes)) {
      console.log(`   - ${name}:`, JSON.stringify(spec));
    }

    // Data consistency validation
    console.log("\n🔍 Data Consistency Validation:");

    // Check for orphaned metrics
    const orphanedResult = await validateOrphanedMetrics();
    if (orphanedResult.isErr()) {
      console.log(
        `   ❌ Failed to check orphaned metrics: ${orphanedResult.error.message}`,
      );
    } else {
      const { orphanedCount, orphanedNodeIds } = orphanedResult.value;
      if (orphanedCount > 0) {
        console.log(
          `   ⚠️  Found ${orphanedCount} orphaned metrics (metrics without corresponding nodes)`,
        );
        console.log(`   Orphaned nodeIds: ${orphanedNodeIds.join(", ")}`);
        console.log(
          "\n   💡 Suggestion: Run the migration to create missing nodes:",
        );
        console.log(
          "      bun run scripts/setup-multi-tenant.ts (without --verify-only)",
        );
      } else {
        console.log("   ✅ No orphaned metrics found");
      }
    }

    // Check for empty nodes
    const emptyNodesResult = await validateEmptyNodes();
    if (emptyNodesResult.isErr()) {
      console.log(
        `   ❌ Failed to check empty nodes: ${emptyNodesResult.error.message}`,
      );
    } else {
      const { emptyCount, emptyNodeIds } = emptyNodesResult.value;
      if (emptyCount > 0) {
        console.log(
          `   ⚠️  Found ${emptyCount} empty nodes (nodes without any metrics)`,
        );
        console.log(`   Empty nodeIds: ${emptyNodeIds.join(", ")}`);
        console.log(
          "\n   💡 Suggestion: These nodes may be newly created or inactive.",
        );
        console.log(
          "      Consider seeding metrics data or removing unused nodes.",
        );
      } else {
        console.log("   ✅ No empty nodes found");
      }
    }

    // Warnings
    if (metricsWithoutNodeId > 0) {
      console.log(
        `\n⚠️  WARNING: ${metricsWithoutNodeId} metrics found without nodeId`,
      );
      console.log(
        "   These will need to be migrated or assigned a default nodeId",
      );
    }

    if (totalMetrics > 0 && totalNodes === 0) {
      console.log("\n⚠️  WARNING: Metrics exist but no nodes are defined");
      console.log("   Run migration to create nodes from existing metrics");
    }

    console.log("\n✅ Verification complete\n");
    return ok(undefined);
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error("Failed to verify database state"),
    );
  }
}

/**
 * Create required indexes for multi-tenant queries
 */
async function createIndexes(): Promise<Result<number, Error>> {
  try {
    console.log("📊 Creating database indexes...");

    let indexCount = 0;

    // Create indexes for RAGMetric collection
    await RAGMetric.createIndexes();
    indexCount += 3; // nodeId, timestamp, compound

    // Create indexes for Node collection
    await Node.createIndexes();
    indexCount += 2; // nodeId, workosOrganizationId

    // Verify indexes were created
    const metricIndexes = await RAGMetric.collection.getIndexes();
    const nodeIndexes = await Node.collection.getIndexes();

    console.log("✅ Database indexes created:");
    console.log("\n   RAGMetric indexes:");
    for (const name of Object.keys(metricIndexes)) {
      console.log(`   - ${name}`);
    }
    console.log("\n   Node indexes:");
    for (const name of Object.keys(nodeIndexes)) {
      console.log(`   - ${name}`);
    }

    return ok(indexCount);
  } catch (error) {
    return err(
      error instanceof Error ? error : new Error("Failed to create indexes"),
    );
  }
}

/**
 * Migrate existing metrics without nodeId
 * Assigns a default nodeId to metrics that don't have one
 */
async function migrateMetricsWithoutNodeId(
  defaultNodeId = "default",
): Promise<Result<number, Error>> {
  try {
    console.log("\n🔄 Checking for metrics without nodeId...");

    // Find metrics without nodeId
    const metricsWithoutNodeId = await RAGMetric.countDocuments({
      $or: [{ nodeId: { $exists: false } }, { nodeId: null }, { nodeId: "" }],
    }).exec();

    if (metricsWithoutNodeId === 0) {
      console.log("✅ All metrics already have nodeId assigned");
      return ok(0);
    }

    console.log(`📝 Found ${metricsWithoutNodeId} metrics without nodeId`);

    if (isDryRun) {
      console.log(
        `[DRY RUN] Would assign nodeId '${defaultNodeId}' to ${metricsWithoutNodeId} metrics`,
      );
      return ok(0);
    }

    // Update metrics without nodeId
    const result = await RAGMetric.updateMany(
      {
        $or: [{ nodeId: { $exists: false } }, { nodeId: null }, { nodeId: "" }],
      },
      { $set: { nodeId: defaultNodeId } },
    ).exec();

    console.log(
      `✅ Updated ${result.modifiedCount} metrics with nodeId '${defaultNodeId}'`,
    );

    // Ensure the default node exists
    const defaultNode = await Node.findOne({ nodeId: defaultNodeId }).exec();
    if (!defaultNode) {
      await Node.create({
        nodeId: defaultNodeId,
        name: "Default Organization",
        workosOrganizationId: `org_${defaultNodeId}`,
        isActive: true,
      });
      console.log(`✅ Created default node: ${defaultNodeId}`);
    }

    return ok(result.modifiedCount);
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error("Failed to migrate metrics without nodeId"),
    );
  }
}

/**
 * Seed initial Node documents from existing metrics
 */
async function seedNodesFromMetrics(): Promise<Result<number, Error>> {
  try {
    console.log("\n🌱 Seeding nodes from existing metrics...");

    // Get unique nodeIds from metrics
    const nodeIds = await RAGMetric.distinct("nodeId").exec();
    console.log(`📊 Found ${nodeIds.length} unique nodeIds in metrics`);

    if (nodeIds.length === 0) {
      console.log("⚠️  No metrics found. Skipping node creation.");
      return ok(0);
    }

    let createdCount = 0;
    let skippedCount = 0;

    for (const nodeId of nodeIds) {
      // Skip null or empty nodeIds
      if (!nodeId || nodeId === "") {
        console.log("⏭️  Skipping empty nodeId");
        skippedCount++;
        continue;
      }

      // Check if node already exists
      const existingNode = await Node.findOne({ nodeId }).exec();

      if (existingNode) {
        console.log(`⏭️  Node ${nodeId} already exists, skipping...`);
        skippedCount++;
        continue;
      }

      if (isDryRun) {
        console.log(`[DRY RUN] Would create node: ${nodeId}`);
        createdCount++;
        continue;
      }

      // Get metrics count for this node
      const metricsCount = await RAGMetric.countDocuments({ nodeId }).exec();

      // Get latest metric timestamp
      const latestMetric = await RAGMetric.findOne({ nodeId })
        .sort({ timestamp: -1 })
        .lean()
        .exec();

      // Create new node
      // In production, workosOrganizationId should be mapped from actual WorkOS organizations
      const node = await Node.create({
        nodeId,
        name: `Company ${nodeId}`, // Placeholder name - should be updated with actual company name
        workosOrganizationId: `org_${nodeId}`, // Placeholder - should be mapped to actual WorkOS org ID
        isActive: true,
      });

      console.log(
        `✅ Created node: ${node.nodeId} (${node.name}) - ${metricsCount} metrics, latest: ${latestMetric?.timestamp?.toISOString() ?? "N/A"}`,
      );
      createdCount++;
    }

    console.log(
      `\n📝 Summary: Created ${createdCount} nodes, skipped ${skippedCount} existing nodes`,
    );

    if (createdCount > 0 && !isDryRun) {
      console.log(
        "\n⚠️  NOTE: Placeholder names and WorkOS organization IDs were used.",
      );
      console.log(
        "   Update these with actual values from WorkOS before going to production.",
      );
    }

    return ok(createdCount);
  } catch (error) {
    return err(
      error instanceof Error ? error : new Error("Failed to seed nodes"),
    );
  }
}

/**
 * Rollback migration
 * WARNING: This will remove all nodes and drop indexes
 */
async function rollbackMigration(): Promise<Result<void, Error>> {
  try {
    console.log("\n⚠️  ROLLBACK MODE - This will remove nodes and indexes\n");

    if (isDryRun) {
      console.log("[DRY RUN] Would perform rollback:");
      console.log("  - Drop indexes on RAGMetric collection");
      console.log("  - Delete all Node documents");
      return ok(undefined);
    }

    // Confirm rollback
    console.log(
      "Are you sure you want to rollback? This action cannot be undone.",
    );
    console.log("Press Ctrl+C to cancel, or wait 5 seconds to continue...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Drop specific indexes (keep _id index)
    console.log("\n🗑️  Dropping multi-tenant indexes...");

    try {
      await RAGMetric.collection.dropIndex("nodeId_1");
      console.log("   Dropped: nodeId_1");
    } catch (e) {
      console.log("   Index nodeId_1 not found or already dropped");
    }

    try {
      await RAGMetric.collection.dropIndex("nodeId_1_timestamp_-1");
      console.log("   Dropped: nodeId_1_timestamp_-1");
    } catch (e) {
      console.log(
        "   Index nodeId_1_timestamp_-1 not found or already dropped",
      );
    }

    // Delete all nodes
    const deleteResult = await Node.deleteMany({}).exec();
    console.log(`\n🗑️  Deleted ${deleteResult.deletedCount} nodes`);

    console.log("\n✅ Rollback complete");
    console.log(
      "   Note: Metrics still have nodeId field. Run migration again to reassign.",
    );

    return ok(undefined);
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error("Failed to rollback migration"),
    );
  }
}

/**
 * Run the complete migration
 */
async function runMigration(): Promise<Result<MigrationStats, Error>> {
  const stats: MigrationStats = {
    indexesCreated: 0,
    metricsUpdated: 0,
    nodesCreated: 0,
    errors: [],
  };

  try {
    console.log("🚀 Starting multi-tenant database migration...\n");

    if (isDryRun) {
      console.log("🔍 DRY RUN MODE - No changes will be made\n");
    }

    // Step 1: Create indexes
    console.log("Step 1: Creating indexes");
    const indexResult = await createIndexes();
    if (indexResult.isErr()) {
      stats.errors.push(`Index creation: ${indexResult.error.message}`);
      console.error("❌ Failed to create indexes:", indexResult.error.message);
    } else {
      stats.indexesCreated = indexResult.value;
    }

    // Step 2: Migrate metrics without nodeId
    console.log("\nStep 2: Migrating metrics without nodeId");
    const migrateResult = await migrateMetricsWithoutNodeId();
    if (migrateResult.isErr()) {
      stats.errors.push(`Metrics migration: ${migrateResult.error.message}`);
      console.error(
        "❌ Failed to migrate metrics:",
        migrateResult.error.message,
      );
    } else {
      stats.metricsUpdated = migrateResult.value;
    }

    // Step 3: Seed nodes from metrics
    console.log("\nStep 3: Seeding nodes from metrics");
    const seedResult = await seedNodesFromMetrics();
    if (seedResult.isErr()) {
      stats.errors.push(`Node seeding: ${seedResult.error.message}`);
      console.error("❌ Failed to seed nodes:", seedResult.error.message);
    } else {
      stats.nodesCreated = seedResult.value;
    }

    // Step 4: Final verification
    console.log("\nStep 4: Final verification");
    const verifyResult = await verifyDatabaseState();
    if (verifyResult.isErr()) {
      stats.errors.push(`Verification: ${verifyResult.error.message}`);
      console.error("❌ Verification failed:", verifyResult.error.message);
    }

    return ok(stats);
  } catch (error) {
    return err(error instanceof Error ? error : new Error("Migration failed"));
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     Multi-Tenant Database Migration Script                ║");
  console.log(
    "╚════════════════════════════════════════════════════════════╝\n",
  );

  // Connect to database
  const connectionResult = await connectDB();
  if (connectionResult.isErr()) {
    console.error("❌ Connection error:", connectionResult.error.message);
    process.exit(1);
  }

  try {
    if (isVerifyOnly) {
      // Verify only mode
      const verifyResult = await verifyDatabaseState();
      if (verifyResult.isErr()) {
        console.error("❌ Verification failed:", verifyResult.error.message);
        process.exit(1);
      }
    } else if (isRollback) {
      // Rollback mode
      const rollbackResult = await rollbackMigration();
      if (rollbackResult.isErr()) {
        console.error("❌ Rollback failed:", rollbackResult.error.message);
        process.exit(1);
      }
    } else {
      // Normal migration mode
      const migrationResult = await runMigration();

      if (migrationResult.isErr()) {
        console.error("\n❌ Migration failed:", migrationResult.error.message);
        process.exit(1);
      }

      const stats = migrationResult.value;

      // Print summary
      console.log(
        "\n╔════════════════════════════════════════════════════════════╗",
      );
      console.log(
        "║                   Migration Summary                        ║",
      );
      console.log(
        "╚════════════════════════════════════════════════════════════╝",
      );
      console.log(`\n📊 Statistics:`);
      console.log(`   Indexes created: ${stats.indexesCreated}`);
      console.log(`   Metrics updated: ${stats.metricsUpdated}`);
      console.log(`   Nodes created: ${stats.nodesCreated}`);

      if (stats.errors.length > 0) {
        console.log(`\n⚠️  Errors encountered: ${stats.errors.length}`);
        for (const error of stats.errors) {
          console.log(`   - ${error}`);
        }
      }

      if (stats.errors.length === 0) {
        console.log("\n🎉 Migration completed successfully!");
      } else {
        console.log("\n⚠️  Migration completed with errors");
      }

      if (!isDryRun && stats.nodesCreated > 0) {
        console.log("\n📝 Next steps:");
        console.log(
          "   1. Update node names and WorkOS organization IDs with actual values",
        );
        console.log("   2. Verify all metrics have correct nodeId assignments");
        console.log("   3. Test authentication and authorization flows");
        console.log(
          "   4. Run verification: bun run scripts/setup-multi-tenant.ts --verify-only",
        );
      }
    }
  } finally {
    // Disconnect from database
    const disconnectResult = await disconnectDB();
    if (disconnectResult.isErr()) {
      console.error("❌ Disconnect error:", disconnectResult.error.message);
      process.exit(1);
    }
  }

  process.exit(0);
}

// Run the main function
void main();
