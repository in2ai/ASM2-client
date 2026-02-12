"use client";

import { Activity, Clock, Database, Sparkles, User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
  const locale = useLocale();
  const t = useTranslations("StatsRow");

  const userActivity = metrics.user_activity;
  const metricsData = metrics.metrics;

  const uniqueUsers = userActivity.unique_users.toLocaleString(locale);
  const totalEvents = userActivity.total_events.toLocaleString(locale);
  const avgSession = userActivity.mean_session_length_seconds
    ? (userActivity.mean_session_length_seconds / 60).toFixed(1)
    : "0.0";
  const ragLatency = metricsData.response_time
    ? metricsData.response_time.toFixed(0)
    : "0";
  const totalMetrics = metricsData.total_count.toLocaleString(locale);

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label={t("uniqueUsers.label")}
        value={uniqueUsers}
        helper={t("uniqueUsers.helper")}
        icon={User}
      />
      <StatCard
        label={t("totalEvents.label")}
        value={totalEvents}
        helper={t("totalEvents.helper")}
        icon={Activity}
      />
      <StatCard
        label={t("avgSession.label")}
        value={`${avgSession}m`}
        helper={t("avgSession.helper")}
        icon={Clock}
      />
      <StatCard
        label={t("ragLatency.label")}
        value={`${ragLatency}ms`}
        helper={t("ragLatency.helper")}
        icon={Sparkles}
      />
      <StatCard
        label={t("ragMetrics.label")}
        value={totalMetrics}
        helper={t("ragMetrics.helper")}
        icon={Database}
      />
    </div>
  );
}
