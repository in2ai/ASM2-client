#!/usr/bin/env bun
import type mongoose from "mongoose";
import { type Result, err, ok } from "neverthrow";
import {
  connectDB as dbConnect,
  disconnectDB as dbDisconnect,
} from "../src/lib/db.js";
import { RAGMetric } from "../src/models/metric.js";
import metricsData from "./metrics-seed-data.json";
import { seedNodes } from "./seed-nodes.js";

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

// Clear existing RAG metrics
async function clearRAGMetrics(): Promise<Result<number, Error>> {
  try {
    const result = await RAGMetric.deleteMany({}).exec();
    console.log(`🗑️  Cleared ${result.deletedCount} existing RAG metrics`);
    return ok(result.deletedCount);
  } catch (error) {
    return err(
      error instanceof Error ? error : new Error("Failed to clear RAG metrics"),
    );
  }
}

// Insert RAG metrics from JSON file
async function insertRAGMetrics(): Promise<Result<number, Error>> {
  try {
    const result = await RAGMetric.insertMany(metricsData, { ordered: false });
    console.log(`✅ Inserted ${result.length} RAG metrics from JSON file`);
    return ok(result.length);
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error("Failed to insert RAG metrics"),
    );
  }
}

// Create database indexes
async function createIndexes(): Promise<Result<void, Error>> {
  try {
    console.log("📊 Creating database indexes...");

    // Create indexes for RAGMetric collection
    await RAGMetric.createIndexes();

    // Verify indexes were created
    const indexes = await RAGMetric.collection.getIndexes();
    console.log("✅ Database indexes created:");
    for (const [name, spec] of Object.entries(indexes)) {
      console.log(`   - ${name}:`, spec);
    }

    return ok(undefined);
  } catch (error) {
    return err(
      error instanceof Error ? error : new Error("Failed to create indexes"),
    );
  }
}

// Main seed function
async function seed(): Promise<void> {
  console.log("� Starting database seed...\n");

  // Connect to database
  const connectionResult = await connectDB();
  if (connectionResult.isErr()) {
    console.error("❌ Connection error:", connectionResult.error.message);
    process.exit(1);
  }

  // Seed nodes first to maintain referential integrity
  console.log("🌱 Seeding nodes...\n");
  const nodesResult = await seedNodes();
  if (nodesResult.isErr()) {
    console.error("❌ Node seeding error:", nodesResult.error.message);
    await disconnectDB();
    process.exit(1);
  }
  const nodesCreated = nodesResult.value;

  // Clear existing RAG metrics
  const clearResult = await clearRAGMetrics();
  if (clearResult.isErr()) {
    console.error("❌ Clear error:", clearResult.error.message);
    await disconnectDB();
    process.exit(1);
  }

  // Insert new RAG metrics from JSON file
  const insertResult = await insertRAGMetrics();
  if (insertResult.isErr()) {
    console.error("❌ Insert error:", insertResult.error.message);
    await disconnectDB();
    process.exit(1);
  }
  const metricsInserted = insertResult.value;

  // Create database indexes
  const indexResult = await createIndexes();
  if (indexResult.isErr()) {
    console.error("❌ Index creation error:", indexResult.error.message);
    await disconnectDB();
    process.exit(1);
  }

  // Add more collections here as needed
  // Example:
  // const userResult = await seedUsers();
  // if (userResult.isErr()) {
  //   console.error("❌ User seed error:", userResult.error.message);
  // }

  console.log("\n🎉 Database seeded successfully!");
  console.log("\n📊 Summary:");
  console.log(`   - Nodes created/updated: ${nodesCreated}`);
  console.log(`   - Metrics inserted: ${metricsInserted}`);

  // Disconnect from database
  const disconnectResult = await disconnectDB();
  if (disconnectResult.isErr()) {
    console.error("❌ Disconnect error:", disconnectResult.error.message);
    process.exit(1);
  }

  process.exit(0);
}

// Run the seed function
void seed();
