#!/usr/bin/env bun
import { connectDB, disconnectDB } from "../src/lib/db.js";
import { RAGMetric } from "../src/models/metric.js";
import { Node } from "../src/models/node.js";

console.log("🔍 Verifying seed data...\n");

// Connect to database
await connectDB();

// Check nodes collection
console.log("📦 Nodes Collection:");
console.log("=".repeat(50));
const nodes = await Node.find({}).lean().exec();
console.log(`Total nodes: ${nodes.length}\n`);

for (const node of nodes) {
  console.log(`Node ID: ${node.nodeId}`);
  console.log(`  Name: ${node.name}`);
  console.log(`  WorkOS Org ID: ${node.workosOrganizationId}`);
  console.log(`  Active: ${node.isActive}`);
  console.log();
}

// Check metrics collection
console.log("\n📊 RAGMetrics Collection:");
console.log("=".repeat(50));
const metrics = await RAGMetric.find({}).lean().exec();
console.log(`Total metrics: ${metrics.length}\n`);

// Group metrics by nodeId
const metricsByNode = new Map<string, number>();
for (const metric of metrics) {
  const count = metricsByNode.get(metric.nodeId) ?? 0;
  metricsByNode.set(metric.nodeId, count + 1);
}

console.log("Metrics by nodeId:");
for (const [nodeId, count] of metricsByNode.entries()) {
  console.log(`  ${nodeId}: ${count} metric(s)`);
}

// Verify referential integrity
console.log("\n🔗 Referential Integrity Check:");
console.log("=".repeat(50));
const nodeIds = new Set(nodes.map((n) => n.nodeId));
const orphanedMetrics: string[] = [];

for (const metric of metrics) {
  if (!nodeIds.has(metric.nodeId)) {
    orphanedMetrics.push(metric.nodeId);
  }
}

if (orphanedMetrics.length === 0) {
  console.log("✅ All metrics reference valid nodes");
} else {
  console.log(`❌ Found ${orphanedMetrics.length} orphaned metrics:`);
  for (const nodeId of new Set(orphanedMetrics)) {
    console.log(`  - ${nodeId}`);
  }
}

// Check for empty nodes
console.log("\n📭 Empty Nodes Check:");
console.log("=".repeat(50));
const emptyNodes: string[] = [];

for (const node of nodes) {
  if (!metricsByNode.has(node.nodeId)) {
    emptyNodes.push(node.nodeId);
  }
}

if (emptyNodes.length === 0) {
  console.log("✅ All nodes have metrics");
} else {
  console.log(`⚠️  Found ${emptyNodes.length} nodes without metrics:`);
  for (const nodeId of emptyNodes) {
    console.log(`  - ${nodeId}`);
  }
}

// Check indexes
console.log("\n📑 Index Verification:");
console.log("=".repeat(50));

console.log("\nNode collection indexes:");
const nodeIndexes = await Node.collection.getIndexes();
for (const [name, spec] of Object.entries(nodeIndexes)) {
  console.log(`  ✓ ${name}`);
}

console.log("\nRAGMetric collection indexes:");
const metricIndexes = await RAGMetric.collection.getIndexes();
for (const [name, spec] of Object.entries(metricIndexes)) {
  console.log(`  ✓ ${name}`);
}

console.log("\n✅ Verification complete!");

// Disconnect
await disconnectDB();
process.exit(0);
