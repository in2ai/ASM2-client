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
  pinned: boolean
  archived: boolean
  last_message_preview: string | null
}

export interface ChatDetail extends ChatSummary {
  messages: ChatMessage[]
}

export interface CreateChatInput {
  title?: string
}

export interface RenameChatInput {
  chatId: string
  title: string
}

export interface SetChatPinnedInput {
  chatId: string
  pinned: boolean
}

export interface SetChatArchivedInput {
  archived: boolean
  chatId: string
}

/**
 * A step the backend reports while it works on an answer.
 *
 * The backend sends the phase and its numbers, never wording, so the step is
 * shown in the language the user is reading the app in.
 */
export type ChatProgressPhase =
  | 'understanding'
  | 'thinking'
  | 'searching'
  | 'reading'
  | 'expanding'
  | 'refining'
  | 'writing_document'
  | 'composing'
  | 'summarizing'

export interface ChatProgressEvent {
  phase: ChatProgressPhase
  /** Searches started in this round, for `searching` and `refining`. */
  searches?: number
  /** The document being looked at in full, for `expanding`. */
  title?: string
  /** The document format being written, for `writing_document`. */
  format?: string
}

export interface SendMessageInput {
  chatId: string
  content: string
  onProgress?: (event: ChatProgressEvent) => void
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

export type SourceProviderKey = 'drive' | 'dropbox'

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
  /** A run is working right now, so scheduling another one would do nothing. */
  running: boolean
}

export interface StartVdbUpdateResult {
  active: boolean
  /** False when the request only kept indexing on, because a run was already working. */
  scheduled: boolean
}
