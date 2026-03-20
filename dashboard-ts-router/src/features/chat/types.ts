export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  chat_id: string
  role: ChatRole
  content: string
  created_at: string
  status: string | null
  metadata: Record<string, unknown> | null
}

export interface ChatSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
  last_message_preview: string | null
}

export interface ChatDetail extends ChatSummary {
  messages: ChatMessage[]
}

export interface CreateChatInput {
  title?: string
}

export interface SendMessageInput {
  chatId: string
  content: string
}

export interface SendMessageResult {
  chat: ChatDetail
  user_message: ChatMessage
  assistant_message: ChatMessage
  detected_lang: string
}

export type SourceProviderKey = 'drive'

export interface SourceProviderStatus {
  key: SourceProviderKey
  label: string
  configured: boolean
  connected: boolean
  selected: boolean
  auth_mode: 'authorization_code'
  account_label: string | null
  oauth_client_id: string | null
}

export interface ReindexStatus {
  in_progress: boolean
  last_started_at: string | null
  last_finished_at: string | null
  error: string | null
}

export interface SourcesStatus {
  providers: SourceProviderStatus[]
  connected_sources: SourceProviderKey[]
  selected_sources: SourceProviderKey[]
  can_chat: boolean
  reindex: ReindexStatus
}

export interface SourceConnectCompleteInput {
  provider: SourceProviderKey
  code?: string
  redirectUri?: string
}
