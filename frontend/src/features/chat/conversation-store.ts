import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'
import type { ChatMessage, ChatProgressEvent } from './types'

/** A turn the backend is still working on, and what it has reported so far. */
export interface TurnInFlight {
  progress: readonly ChatProgressEvent[]
  /** Lets the user stop waiting; see `handleStopGeneration`. */
  abort: () => void
  /**
   * When the turn started. Kept here rather than in the activity component so
   * the elapsed count survives the user switching conversations and back.
   */
  startedAt: number
}

/**
 * What each conversation has going on that the server does not have yet:
 * the draft being typed, the error from the last attempt, the question sent
 * and the turn still answering it. Every part is keyed by conversation.
 */
interface ConversationState {
  drafts: Readonly<Record<string, string>>
  errors: Readonly<Record<string, string>>
  pendingMessages: Readonly<Record<string, ChatMessage>>
  turns: Readonly<Record<string, TurnInFlight>>
}

type Slice = keyof ConversationState

type SliceUpdate<K extends Slice> = (
  current: ConversationState[K],
) => ConversationState[K]

interface ConversationStore {
  getSnapshot: () => ConversationState
  subscribe: (listener: () => void) => () => void
  update: <K extends Slice>(slice: K, recipe: SliceUpdate<K>) => void
}

function createConversationStore(): ConversationStore {
  let state: ConversationState = {
    drafts: {},
    errors: {},
    pendingMessages: {},
    turns: {},
  }
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    update: (slice, recipe) => {
      const next = recipe(state[slice])

      if (next === state[slice]) {
        return
      }

      state = { ...state, [slice]: next }
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

const stores = new WeakMap<QueryClient, ConversationStore>()

/**
 * The conversations' store, one per query client.
 *
 * It cannot live in the chat page: a turn outlives the page that started it.
 * Going to the dashboard while the backend is still answering unmounts the
 * page, but the stream keeps being read, and what it reports has to be there
 * for the page that is on screen when the user comes back. The query client
 * lasts as long as the app does -- and gives each test a store of its own, as
 * it gives each one its own cache.
 */
export function useConversationStore(): ConversationStore {
  const queryClient = useQueryClient()
  let store = stores.get(queryClient)

  if (!store) {
    store = createConversationStore()
    stores.set(queryClient, store)
  }

  return store
}

/**
 * One part of the conversations' state, read and written like `useState`.
 *
 * The setter writes to the store rather than to this component, so a turn
 * that finishes after the page has gone still lands where the next one reads.
 */
export function useConversationState<K extends Slice>(
  slice: K,
): readonly [ConversationState[K], (recipe: SliceUpdate<K>) => void] {
  const store = useConversationStore()
  const value = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot()[slice],
  )
  const setValue = useCallback(
    (recipe: SliceUpdate<K>) => store.update(slice, recipe),
    [store, slice],
  )

  return [value, setValue]
}
