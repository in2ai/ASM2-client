import mongoose from "mongoose";

export interface IRAGMetric {
  nodeId: string;
  usage_metrics: {
    unique_users: {
      daily: number;
      weekly: number;
      monthly: number;
    };
    active_sessions: {
      daily: number;
      weekly: number;
      monthly: number;
    };
    processed_queries: {
      total: number;
      daily_average: number;
    };
    session_duration: {
      average_minutes: number;
      median_minutes: number;
    };
    department_distribution: {
      hr: number;
      it: number;
      legal: number;
      finance: number;
      other: number;
    };
  };
  rag_quality_metrics: {
    successful_retrieval_rate: number;
    retrieval_latency_ms: number;
    empty_response_rate: number;
    average_context_tokens: number;
  };
  performance_metrics: {
    average_response_time_ms: number;
    token_usage: {
      average_prompt: number;
      average_completion: number;
      average_total: number;
    };
    resource_consumption: {
      cpu_percent: number;
      memory_mb: number;
      connection_latency_ms: number;
    };
    cost_per_query: number;
    errors: {
      timeout: number;
      retrieval_failure: number;
      model_call_failure: number;
      other: number;
    };
  };
  extra_analytics: {
    top_queries: string[];
    common_words: string[];
    thematic_distribution: {
      hr: number;
      it: number;
      legal: number;
      finance: number;
      other: number;
    };
  };
  alerts: {
    latency_alert: number;
    error_rate_alert: number;
    status: string;
  };
  timestamp: Date;
}

const ragMetricSchema = new mongoose.Schema<IRAGMetric>(
  {
    nodeId: { type: String, required: true },
    usage_metrics: {
      unique_users: {
        daily: { type: Number, required: true },
        weekly: { type: Number, required: true },
        monthly: { type: Number, required: true },
      },
      active_sessions: {
        daily: { type: Number, required: true },
        weekly: { type: Number, required: true },
        monthly: { type: Number, required: true },
      },
      processed_queries: {
        total: { type: Number, required: true },
        daily_average: { type: Number, required: true },
      },
      session_duration: {
        average_minutes: { type: Number, required: true },
        median_minutes: { type: Number, required: true },
      },
      department_distribution: {
        hr: { type: Number, required: true },
        it: { type: Number, required: true },
        legal: { type: Number, required: true },
        finance: { type: Number, required: true },
        other: { type: Number, required: true },
      },
    },
    rag_quality_metrics: {
      successful_retrieval_rate: { type: Number, required: true },
      retrieval_latency_ms: { type: Number, required: true },
      empty_response_rate: { type: Number, required: true },
      average_context_tokens: { type: Number, required: true },
    },
    performance_metrics: {
      average_response_time_ms: { type: Number, required: true },
      token_usage: {
        average_prompt: { type: Number, required: true },
        average_completion: { type: Number, required: true },
        average_total: { type: Number, required: true },
      },
      resource_consumption: {
        cpu_percent: { type: Number, required: true },
        memory_mb: { type: Number, required: true },
        connection_latency_ms: { type: Number, required: true },
      },
      cost_per_query: { type: Number, required: true },
      errors: {
        timeout: { type: Number, required: true },
        retrieval_failure: { type: Number, required: true },
        model_call_failure: { type: Number, required: true },
        other: { type: Number, required: true },
      },
    },
    extra_analytics: {
      top_queries: [{ type: String, required: true }],
      common_words: [{ type: String, required: true }],
      thematic_distribution: {
        hr: { type: Number, required: true },
        it: { type: Number, required: true },
        legal: { type: Number, required: true },
        finance: { type: Number, required: true },
        other: { type: Number, required: true },
      },
    },
    alerts: {
      latency_alert: { type: Number, required: true },
      error_rate_alert: { type: Number, required: true },
      status: { type: String, required: true },
    },
    timestamp: { type: Date, required: true },
  },
  { timestamps: true },
);

// Indexes for efficient queries
ragMetricSchema.index({ nodeId: 1 });
ragMetricSchema.index({ timestamp: -1 }); // For time-based queries
ragMetricSchema.index({ nodeId: 1, timestamp: -1 }); // Compound index for node-specific time queries

export const RAGMetric =
  (mongoose.models.RAGMetric as mongoose.Model<IRAGMetric>) ||
  mongoose.model<IRAGMetric>("RAGMetric", ragMetricSchema);

export { ragMetricSchema };
