export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatSource {
  title: string
  source_type: string
  link: string | null
  pages?: number[]
}

export interface ChatDocument {
  filename: string
  format: string
  mime_type: string
  size_bytes: number
  title?: string
}

export interface ChatMessageMetadata {
  detected_lang?: string
  document?: ChatDocument
  sources?: ChatSource[]
}

export interface ChatMessage {
  id: string
  chat_id: string
  role: ChatRole
  content: string
  created_at: string
  status: string | null
  metadata: ChatMessageMetadata | null
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

export interface DownloadDocumentInput {
  chatId: string
  filename: string
  messageId: string
}

export interface SendMessageResult {
  chat: ChatDetail
  user_message: ChatMessage
  assistant_message: ChatMessage
  detected_lang: string
}

export type SourceProviderKey = 'drive'

export interface SourceLoginInfo {
  auth_mode: 'authorization_code'
  oauth_client_id: string | null
}

export interface SourcesStatus {
  connected_sources: SourceProviderKey[]
  selected_sources: SourceProviderKey[]
  vdb_indexing_active: boolean
  can_chat: boolean
}

export interface VdbUpdateStatus {
  active: boolean
}
