export interface DeletionGuardConfig {
  threshold_percentage: number | null
}

export interface DeletionGuardUpdate {
  threshold_percentage: number
}

export interface IndexingDeletionAlert {
  id: number
  source: string
  deleted_documents: number
  total_documents: number
  percentage: number
  threshold_percentage: number
  created_at: string
}
