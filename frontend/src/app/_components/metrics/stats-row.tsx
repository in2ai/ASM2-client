import { Activity, Clock, Database, Sparkles, User } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { StatCard } from './stat-card'
import { type MetricsResponse } from './types'

/** Shown where there is nothing to measure, as opposed to a measured zero. */
const NO_VALUE = '—'

interface StatsRowProps {
  metrics: MetricsResponse
}

export function StatsRow({ metrics }: Readonly<StatsRowProps>) {
  const locale = useLocale()
  const t = useTranslations('StatsRow')

  const userActivity = metrics.user_activity
  const metricsData = metrics.metrics

  const uniqueUsers = userActivity.unique_users.toLocaleString(locale)
  const totalEvents = userActivity.total_events.toLocaleString(locale)
  // A session needs at least two events to span any time, so a period with
  // only one-shot questions has nothing to average rather than zero minutes.
  const avgSession = userActivity.mean_session_length_seconds
    ? `${(userActivity.mean_session_length_seconds / 60).toFixed(1)}m`
    : NO_VALUE
  // Already in seconds. A turn runs tens of seconds, so milliseconds only
  // added digits nobody reads.
  const turnLatency = metricsData.turn_response_time
    ? `${metricsData.turn_response_time.toFixed(1)}s`
    : NO_VALUE
  const totalMetrics = metricsData.total_count.toLocaleString(locale)

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label={t('uniqueUsers.label')}
        value={uniqueUsers}
        helper={t('uniqueUsers.helper')}
        icon={User}
      />
      <StatCard
        label={t('totalEvents.label')}
        value={totalEvents}
        helper={t('totalEvents.helper')}
        icon={Activity}
      />
      <StatCard
        label={t('avgSession.label')}
        value={avgSession}
        helper={t('avgSession.helper')}
        icon={Clock}
      />
      <StatCard
        label={t('turnLatency.label')}
        value={turnLatency}
        helper={t('turnLatency.helper')}
        icon={Sparkles}
      />
      <StatCard
        label={t('assistantMetrics.label')}
        value={totalMetrics}
        helper={t('assistantMetrics.helper')}
        icon={Database}
      />
    </div>
  )
}
