#!/usr/bin/env bun

import { type Result, err, ok } from "neverthrow";
import type mongoose from "mongoose";
import {
  connectDB as dbConnect,
  disconnectDB as dbDisconnect,
} from "../src/lib/db.js";
import { UserPreferences } from "../src/models/user-preferences.js";

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

// Fix duplicate indexes
async function fixDuplicateIndexes(): Promise<Result<void, Error>> {
  try {
    const collection = UserPreferences.collection;

    // List current indexes
    const indexes = await collection.getIndexes();
    console.log("\n📊 Current indexes on UserPreferences:");
    for (const [name, spec] of Object.entries(indexes)) {
      console.log(`  - ${name}:`, spec);
    }

    // Drop ALL indexes except _id (which cannot be dropped)
    console.log("\n🗑️  Dropping all indexes except _id...");
    for (const indexName of Object.keys(indexes)) {
      if (indexName !== "_id_") {
        try {
          await collection.dropIndex(indexName);
          console.log(`  ✓ Dropped ${indexName}`);
        } catch (error: unknown) {
          const err = error as { code?: number; codeName?: string };
          if (err.code === 27 || err.codeName === "IndexNotFound") {
            console.log(`  ⏭️  ${indexName} already removed`);
          } else {
            console.error(`  ❌ Failed to drop ${indexName}:`, error);
          }
        }
      }
    }

    // Recreate indexes properly
    console.log("\n�  Recreating indexes from schema...");
    await UserPreferences.createIndexes();

    // List indexes after cleanup
    const updatedIndexes = await collection.getIndexes();
    console.log("\n📊 Indexes after cleanup:");
    for (const [name, spec] of Object.entries(updatedIndexes)) {
      console.log(`  - ${name}:`, spec);
    }

    return ok(undefined);
  } catch (error) {
    return err(
      error instanceof Error ? error : new Error("Failed to fix indexes"),
    );
  }
}

// Main function
console.log("🔧 Starting index cleanup...\n");

// Connect to database
const connectionResult = await connectDB();
if (connectionResult.isErr()) {
  console.error("❌ Connection error:", connectionResult.error.message);
  process.exit(1);
}

// Fix duplicate indexes
const fixResult = await fixDuplicateIndexes();
if (fixResult.isErr()) {
  console.error("❌ Error fixing indexes:", fixResult.error.message);
  await disconnectDB();
  process.exit(1);
}

console.log("\n🎉 Index cleanup complete!");

// Disconnect from database
const disconnectResult = await disconnectDB();
if (disconnectResult.isErr()) {
  console.error("❌ Disconnect error:", disconnectResult.error.message);
  process.exit(1);
}

process.exit(0);
