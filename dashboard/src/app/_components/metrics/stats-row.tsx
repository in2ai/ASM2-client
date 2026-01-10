"use client";

import { Activity, Clock, Database, Sparkles, User } from "lucide-react";
import { StatCard } from "./stat-card";
import { type MetricsResponse } from "./types";

interface StatsRowProps {
  metrics: MetricsResponse;
}

/**
 * Render a responsive row of five metric summary cards derived from a MetricsResponse.
 *
 * @param metrics - MetricsResponse containing `user_activity` and `metrics` used to populate the cards
 * @returns A JSX element: a responsive grid of StatCard components showing unique users, total events, average session (minutes), RAG latency (ms), and total RAG metrics
 */
export function StatsRow({ metrics }: Readonly<StatsRowProps>) {
  const userActivity = metrics.user_activity;
  const metricsData = metrics.metrics;

  const uniqueUsers = userActivity.unique_users.toLocaleString("es-ES");
  const totalEvents = userActivity.total_events.toLocaleString("es-ES");
  const avgSession = userActivity.mean_session_length_seconds
    ? (userActivity.mean_session_length_seconds / 60).toFixed(1)
    : "0.0";
  const ragLatency = metricsData.response_time
    ? metricsData.response_time.toFixed(0)
    : "0";
  const totalMetrics = metricsData.total_count.toLocaleString("es-ES");

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label="Usuarios únicos"
        value={uniqueUsers}
        helper="En el período"
        icon={User}
      />
      <StatCard
        label="Eventos totales"
        value={totalEvents}
        helper="Interacciones"
        icon={Activity}
      />
      <StatCard
        label="Sesión media"
        value={`${avgSession}m`}
        helper="Tiempo de uso"
        icon={Clock}
      />
      <StatCard
        label="Latencia RAG"
        value={`${ragLatency}ms`}
        helper="Respuesta LLM"
        icon={Sparkles}
      />
      <StatCard
        label="Métricas RAG"
        value={totalMetrics}
        helper="Registros totales"
        icon={Database}
      />
    </div>
  );
}