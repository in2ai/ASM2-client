import { cn } from '@/lib/utils'
import { Check, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BubbleAvatar } from './chat-avatar'
import type { ChatProgressEvent } from './types'

interface ChatActivityProps {
  /** What the backend has reported so far, oldest step first. */
  events: readonly ChatProgressEvent[]
  /** Stands in until the first step arrives. */
  fallbackLabel: string
  formatEvent: (event: ChatProgressEvent) => string
  /** Seconds spent so far, as the user reads it. */
  formatElapsed: (seconds: number) => string
  /**
   * When the turn started, as epoch milliseconds. Passing it keeps the count
   * honest when this component remounts -- switching conversations away and
   * back would otherwise restart it from zero.
   */
  startedAt?: number
  title: string
}

/**
 * What the assistant is doing while the answer is being put together.
 *
 * An answer can take a minute, and until now that minute was a bare spinner.
 * Here every step the backend reports stays on screen, the newest one running,
 * so the wait reads as work rather than as something gone wrong.
 */
export function ChatActivity({
  events,
  fallbackLabel,
  formatElapsed,
  formatEvent,
  startedAt,
  title,
}: Readonly<ChatActivityProps>) {
  const elapsed = useElapsedSeconds(startedAt)
  const steps = events.length > 0 ? events.map(formatEvent) : [fallbackLabel]

  return (
    <div className="flex gap-3 sm:gap-4" role="status" aria-live="polite">
      <BubbleAvatar isUser={false} />
      <div className="bg-card min-w-0 max-w-[85%] rounded-3xl border px-5 py-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
            {title}
          </span>
          <span className="text-[11px] tabular-nums opacity-60">
            {formatElapsed(elapsed)}
          </span>
        </div>

        <ol className="space-y-2">
          {steps.map((step, index) => {
            const isCurrent = index === steps.length - 1

            return (
              <li
                key={`${index}-${step}`}
                className={cn(
                  'animate-in fade-in slide-in-from-bottom-1 flex items-center gap-2.5 text-sm duration-300',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {isCurrent ? (
                  <Loader2 className="text-primary h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 shrink-0 opacity-60" />
                )}
                <span className="min-w-0 wrap-break-word">{step}</span>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

/** Seconds since this turn started, ticking while it runs. */
function useElapsedSeconds(startedAt?: number) {
  // A caller that does not track when its turn began still gets a live count,
  // just one that starts here instead of at the real beginning.
  const [mountedAt] = useState(() => Date.now())
  const origin = startedAt ?? mountedAt
  const [seconds, setSeconds] = useState(() => elapsedSince(origin))

  useEffect(() => {
    setSeconds(elapsedSince(origin))

    const timer = setInterval(() => {
      setSeconds(elapsedSince(origin))
    }, 1000)

    return () => clearInterval(timer)
  }, [origin])

  return seconds
}

function elapsedSince(startedAt: number) {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
}
