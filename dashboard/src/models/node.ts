import mongoose from "mongoose";

export interface INode {
  nodeId: string;
  name: string;
  workosOrganizationId: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

const nodeSchema = new mongoose.Schema<INode>(
  {
    nodeId: { type: String, required: true },
    name: { type: String, required: true },
    workosOrganizationId: {
      type: String,
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Indexes for efficient queries
nodeSchema.index({ nodeId: 1 }, { unique: true });
nodeSchema.index({ workosOrganizationId: 1 }, { unique: true });

export const Node =
  (mongoose.models.Node as mongoose.Model<INode>) ||
  mongoose.model<INode>("Node", nodeSchema);

export { nodeSchema };
