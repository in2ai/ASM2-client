import { type RouterOutputs } from '@/lib/metrics-api'

export type MetricsResponse = RouterOutputs['metrics']['get']
export type StatsResponse = RouterOutputs['metrics']['getStats']

export type { LogtoUser } from '@/lib/auth'
