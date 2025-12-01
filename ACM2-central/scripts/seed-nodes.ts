#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { type Result, ok, err } from "neverthrow";
import type mongoose from "mongoose";
import { Node } from "../src/models/node.js";
import {
  connectDB as dbConnect,
  disconnectDB as dbDisconnect,
} from "../src/lib/db.js";

// Connect to MongoDB
async function connectDB(): Promise<Result<typeof mongoose, Error>> {
  try {
    const db = await dbConnect();
    return ok(db);
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error("Failed to connect to MongoDB")
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
        : new Error("Failed to disconnect from MongoDB")
    );
  }
}

// Define test nodes to create
interface TestNodeData {
  nodeId: string;
  name: string;
  workosOrganizationId: string;
  isActive: boolean;
}

const TEST_NODES: TestNodeData[] = [
  {
    nodeId: "org_test_1",
    name: "Test Organization 1",
    workosOrganizationId: "org_test_1",
    isActive: true,
  },
  {
    nodeId: "org_test_2",
    name: "Test Organization 2",
    workosOrganizationId: "org_test_2",
    isActive: true,
  },
  {
    nodeId: "org_test_3",
    name: "Test Organization 3",
    workosOrganizationId: "org_test_3",
    isActive: true,
  },
];

// Create test nodes with upsert logic
export async function seedNodes(): Promise<Result<number, Error>> {
  try {
    let createdCount = 0;
    let updatedCount = 0;

    for (const testNode of TEST_NODES) {
      // Use upsert to prevent duplicates on repeated runs
      const result = await Node.findOneAndUpdate(
        { nodeId: testNode.nodeId },
        {
          $set: {
            name: testNode.name,
            workosOrganizationId: testNode.workosOrganizationId,
            isActive: testNode.isActive,
          },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
        }
      ).exec();

      // Check if this was a new document or an update
      const wasCreated = !result.createdAt || 
        Date.now() - new Date(result.createdAt).getTime() < 1000;
      
      if (wasCreated) {
        console.log(`✅ Created node: ${result.nodeId} (${result.name})`);
        createdCount++;
      } else {
        console.log(`🔄 Updated node: ${result.nodeId} (${result.name})`);
        updatedCount++;
      }
    }

    console.log(
      `\n📝 Summary: Created ${createdCount} nodes, updated ${updatedCount} existing nodes`
    );
    return ok(createdCount);
  } catch (error) {
    return err(
      error instanceof Error ? error : new Error("Failed to seed nodes")
    );
  }
}

// Verify indexes are created
async function verifyIndexes(): Promise<Result<void, Error>> {
  try {
    const indexes = await Node.collection.getIndexes();
    console.log("\n🔍 Node collection indexes:");
    for (const indexName of Object.keys(indexes)) {
      console.log(`  - ${indexName}`);
    }
    return ok(undefined);
  } catch (error) {
    return err(
      error instanceof Error ? error : new Error("Failed to verify indexes")
    );
  }
}

// Main seed function - only run if this file is executed directly
if (import.meta.main) {
  console.log("🌱 Starting test node seed...\n");

  // Connect to database
  const connectionResult = await connectDB();
  if (connectionResult.isErr()) {
    console.error("❌ Connection error:", connectionResult.error.message);
    process.exit(1);
  }

  // Seed test nodes
  const createResult = await seedNodes();
  if (createResult.isErr()) {
    console.error("❌ Error seeding nodes:", createResult.error.message);
    await disconnectDB();
    process.exit(1);
  }

  // Verify indexes
  const indexResult = await verifyIndexes();
  if (indexResult.isErr()) {
    console.error("❌ Error verifying indexes:", indexResult.error.message);
  }

  console.log("\n🎉 Node seed completed successfully!");

  // Disconnect from database
  const disconnectResult = await disconnectDB();
  if (disconnectResult.isErr()) {
    console.error("❌ Disconnect error:", disconnectResult.error.message);
    process.exit(1);
  }

  process.exit(0);
}
