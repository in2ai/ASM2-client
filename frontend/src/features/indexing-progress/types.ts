export const INDEXING_STATUSES = [
  'idle',
  'running',
  'completed',
  'failed',
  'blocked',
  'interrupted',
] as const

export type IndexingStatus = (typeof INDEXING_STATUSES)[number]

export const INDEXING_PHASES = [
  'listing_sources',
  'preflight',
  'permissions',
  'deleting',
  'indexing',
  'long_context',
  'topics',
] as const

export type IndexingPhase = (typeof INDEXING_PHASES)[number]

export interface IndexingProgress {
  status: string
  phase: string | null
  current_source: string | null
  sources_total: number
  sources_completed: number
  files_total: number
  files_processed: number
  chunks_indexed: number
  eta_seconds: number | null
  detail: string | null
  started_at: string | null
  updated_at: string
  finished_at: string | null
  indexing_enabled: boolean
}
