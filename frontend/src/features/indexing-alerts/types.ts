export interface DeletionGuardConfig {
  threshold_percentage: number | null
  override_pending: boolean
}

export interface DeletionGuardUpdate {
  threshold_percentage: number | null
}

export interface DeletionGuardOverrideUpdate {
  override_pending: boolean
}

export interface IndexingAlertSourceImpact {
  source: string
  deleted_documents: number
  total_documents: number
}

export interface IndexingDeletionAlert {
  id: number
  source: string
  deleted_documents: number
  total_documents: number
  percentage: number
  threshold_percentage: number
  created_at: string
  source_breakdown: IndexingAlertSourceImpact[] | null
}
