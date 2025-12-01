# Implementation Plan

- [x] 1. Update seed data with aligned nodeId values
  - Update metrics-seed-data.json to use "org_test_1", "org_test_2", "org_test_3" instead of "node-1", "node-2", "node-3"
  - Ensure all 5 metric documents have the updated nodeId values
  - Maintain all existing metric data structure and values
  - _Requirements: 1.1, 1.2_

- [x] 2. Update seed-nodes.ts script to create matching test nodes
  - Modify the script to create three test nodes with nodeId values: "org_test_1", "org_test_2", "org_test_3"
  - Set workosOrganizationId to match nodeId for each test node
  - Assign descriptive names: "Test Organization 1", "Test Organization 2", "Test Organization 3"
  - Set isActive to true for all test nodes
  - Use upsert logic to prevent duplicate node creation on repeated runs
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3. Enhance main seed script to orchestrate node and metric seeding
  - Import the seedNodes function from seed-nodes.ts
  - Call seedNodes before seeding metrics to maintain referential integrity
  - Add error handling for node seeding failures
  - Update console logging to show summary of both nodes and metrics created
  - _Requirements: 1.1, 4.1_

- [x] 4. Add validation to setup-multi-tenant.ts for data consistency
  - Add a validation function that checks for orphaned metrics (metrics without corresponding nodes)
  - Add a validation function that checks for empty nodes (nodes without any metrics)
  - Include validation results in the verification output
  - Provide warnings and suggestions when inconsistencies are found
  - _Requirements: 4.2, 4.3_

- [x] 5. Improve error messages in metrics router for better debugging
  - Update the "No metrics found" error in metrics.get to check if the user's organizationId exists in nodes collection
  - Return specific error message if node exists but has no metrics: "No metrics data available for your organization yet"
  - Return specific error message if node doesn't exist: "Your organization is not configured in the system"
  - Update error handling in getNodeSummary to use the custom NodeNotFoundError with helpful message
  - _Requirements: 2.2, 3.4_

- [x] 6. Run and verify the updated seed scripts
  - Execute the updated seed.ts script to populate the database
  - Verify in MongoDB that nodes collection has three documents with correct nodeId values
  - Verify in MongoDB that ragmetrics collection has five documents with updated nodeId references
  - Verify that all nodeId values in metrics match existing nodes
  - Check that indexes are created correctly on both collections
  - _Requirements: 1.1, 1.4, 4.1, 4.4_
