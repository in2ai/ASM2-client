import { type RouterOutputs } from '@/trpc/react'

export type MetricsResponse = RouterOutputs['metrics']['get']
export type StatsResponse = RouterOutputs['metrics']['getStats']

export type { LogtoUser } from '@/lib/auth'
