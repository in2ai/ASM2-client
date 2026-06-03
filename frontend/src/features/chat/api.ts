import { API_RESOURCE, BACKEND_URL } from '@/lib/api'
import { useLogto } from '@logto/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ChatDetail,
  ChatSummary,
  CreateChatInput,
  SendMessageInput,
  SendMessageResult,
  SourceLoginInfo,
  SourcesStatus,
  VdbUpdateStatus,
} from './types'

export const chatQueryKeys = {
  all: ['chat'] as const,
  detail: (chatId: string) => ['chat', 'detail', chatId] as const,
  list: ['chat', 'list'] as const,
  sources: ['chat', 'sources'] as const,
  vdbUpdate: ['chat', 'vdb-update'] as const,
}

export function useAuthorizedChatRequest() {
  const { getAccessToken } = useLogto()

  return async function authorizedChatRequest<T>(
    path: string,
    init?: RequestInit,
  ) {
    const token = await getAccessToken(API_RESOURCE)
    if (!token) {
      throw new Error('Missing access token')
    }

    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('Content-Type', 'application/json')

    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers,
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        detail?: string
      } | null
      throw new Error(payload?.detail ?? `Request failed (${response.status})`)
    }

    if (response.status === 204) {
      return undefined as T
    }

    const responseText = await response.text()
    if (!responseText) {
      return undefined as T
    }

    return JSON.parse(responseText) as T
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

export function useSourceLoginInfoQuery(source: string) {
  const request = useAuthorizedChatRequest()

  return useQuery({
    queryKey: [...chatQueryKeys.sources, 'login-info', source],
    queryFn: () =>
      request<SourceLoginInfo>(
        `/sources/login-info?source=${encodeURIComponent(source)}`,
      ),
  })
}

export function useVdbUpdateStatusQuery(enabled: boolean) {
  const request = useAuthorizedChatRequest()

  return useQuery({
    enabled,
    queryKey: chatQueryKeys.vdbUpdate,
    queryFn: () => request<VdbUpdateStatus>('/vdb-update-status'),
  })
}

export function useChatQuery(chatId?: string) {
  const request = useAuthorizedChatRequest()

  return useQuery({
    enabled: Boolean(chatId),
    queryKey: chatId
      ? chatQueryKeys.detail(chatId)
      : ['chat', 'detail', 'empty'],
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

export function useDeleteChatMutation() {
  const request = useAuthorizedChatRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (chatId: string) =>
      request<void>(`/chats/${chatId}`, {
        method: 'DELETE',
      }),
    onSuccess: async (_result, chatId) => {
      queryClient.setQueryData<ChatSummary[] | undefined>(
        chatQueryKeys.list,
        (currentChats) =>
          currentChats?.filter((chat) => chat.id !== chatId) ?? currentChats,
      )
      queryClient.removeQueries({ queryKey: chatQueryKeys.detail(chatId) })
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.list })
    },
  })
}

export function useSendMessageMutation() {
  const request = useAuthorizedChatRequest()

  return useMutation({
    mutationFn: ({ chatId, content }: SendMessageInput) =>
      request<SendMessageResult>(`/chats/${chatId}/messages`, {
        body: JSON.stringify({ content }),
        method: 'POST',
      }),
  })
}

export function useStartVdbUpdateMutation() {
  const request = useAuthorizedChatRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      request<void>('/start-vdb-update', {
        method: 'POST',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.vdbUpdate })
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.sources })
    },
  })
}

export function useStopVdbUpdateMutation() {
  const request = useAuthorizedChatRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      request<void>('/stop-vdb-update', {
        method: 'POST',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.vdbUpdate })
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.sources })
    },
  })
}

export function useUpdateSourcesSelectionMutation() {
  const request = useAuthorizedChatRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (selectedSources: string[]) =>
      request<SourcesStatus>('/sources/selection', {
        body: JSON.stringify({ selected_sources: selectedSources }),
        method: 'PUT',
      }),
    onSuccess: (status) => {
      queryClient.setQueryData(chatQueryKeys.sources, status)
    },
  })
}
