import { useLogto } from '@logto/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { API_RESOURCE, BACKEND_URL } from '@/lib/api'

import type {
  ChatDetail,
  ChatSummary,
  CreateChatInput,
  SourceConnectCompleteInput,
  SourceProviderKey,
  SourcesStatus,
  SendMessageInput,
  SendMessageResult,
} from './types'

export const chatQueryKeys = {
  all: ['chat'] as const,
  detail: (chatId: string) => ['chat', 'detail', chatId] as const,
  list: ['chat', 'list'] as const,
  sources: ['chat', 'sources'] as const,
}

export function useAuthorizedChatRequest() {
  const { getAccessToken } = useLogto()

  return async function authorizedChatRequest<T>(path: string, init?: RequestInit) {
    const token = await getAccessToken(API_RESOURCE)
    if (!token) {
      throw new Error('Missing access token')
    }

    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { detail?: string }
        | null
      throw new Error(payload?.detail ?? `Request failed (${response.status})`)
    }

    return (await response.json()) as T
  }
}

export function useChatsQuery() {
  const request = useAuthorizedChatRequest()

  return useQuery({
    queryKey: chatQueryKeys.list,
    queryFn: () => request<ChatSummary[]>('/chats'),
  })
}

export function useSourcesStatusQuery() {
  const request = useAuthorizedChatRequest()

  return useQuery({
    queryKey: chatQueryKeys.sources,
    queryFn: () => request<SourcesStatus>('/sources/status'),
  })
}

export function useChatQuery(chatId?: string) {
  const request = useAuthorizedChatRequest()

  return useQuery({
    enabled: Boolean(chatId),
    queryKey: chatId ? chatQueryKeys.detail(chatId) : ['chat', 'detail', 'empty'],
    queryFn: () => request<ChatDetail>(`/chats/${chatId}`),
  })
}

export function useCreateChatMutation() {
  const request = useAuthorizedChatRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload?: CreateChatInput) =>
      request<ChatDetail>('/chats', {
        body: JSON.stringify(payload ?? {}),
        method: 'POST',
      }),
    onSuccess: (chat) => {
      queryClient.setQueryData(chatQueryKeys.detail(chat.id), chat)
      void queryClient.invalidateQueries({ queryKey: chatQueryKeys.list })
    },
  })
}

export function useSendMessageMutation() {
  const request = useAuthorizedChatRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ chatId, content }: SendMessageInput) =>
      request<SendMessageResult>(`/chats/${chatId}/messages`, {
        body: JSON.stringify({ content }),
        method: 'POST',
      }),
    onSuccess: (result, variables) => {
      queryClient.setQueryData(chatQueryKeys.detail(variables.chatId), result.chat)
      void queryClient.invalidateQueries({ queryKey: chatQueryKeys.list })
    },
  })
}

export function useUpdateSourceSelectionMutation() {
  const request = useAuthorizedChatRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (selectedSources: SourceProviderKey[]) =>
      request<SourcesStatus>('/sources/selection', {
        body: JSON.stringify({ selected_sources: selectedSources }),
        method: 'PUT',
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(chatQueryKeys.sources, result)
    },
  })
}

export function useCompleteSourceConnectionMutation() {
  const request = useAuthorizedChatRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ provider, code, redirectUri }: SourceConnectCompleteInput) =>
      request<{ success: boolean; message: string }>(`/sources/${provider}/connect`, {
        body: JSON.stringify({ code, redirect_uri: redirectUri }),
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatQueryKeys.sources })
    },
  })
}

export function useDisconnectSourceMutation(provider: SourceProviderKey) {
  const request = useAuthorizedChatRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => request<SourcesStatus>(`/sources/${provider}/disconnect`, { method: 'POST' }),
    onSuccess: (result) => {
      queryClient.setQueryData(chatQueryKeys.sources, result)
    },
  })
}

export function useReindexSourcesMutation() {
  const request = useAuthorizedChatRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sources?: SourceProviderKey[]) =>
      request<SourcesStatus>('/sources/reindex', {
        body: JSON.stringify(sources ? { sources } : {}),
        method: 'POST',
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(chatQueryKeys.sources, result)
    },
  })
}
