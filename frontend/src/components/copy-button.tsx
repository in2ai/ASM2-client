import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface CopyButtonProps {
  className?: string
  /** Shown while idle, and as the accessible name. */
  copyLabel: string
  /** Shown for a moment after a copy lands. */
  copiedLabel: string
  value: string
}

/**
 * Copies `value`, then says so for a moment.
 *
 * The confirmation is the whole point: a clipboard write is silent, and
 * without a visible change the reader cannot tell a successful copy from a
 * click that missed.
 */
export function CopyButton({
  className,
  copyLabel,
  copiedLabel,
  value,
}: Readonly<CopyButtonProps>) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Clipboard access is denied in some browsers outside a secure context.
      // Nothing was copied, so say nothing rather than claim success.
      return
    }

    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Button
      aria-label={copied ? copiedLabel : copyLabel}
      className={cn('h-7 w-7 rounded-lg', className)}
      onClick={() => void handleCopy()}
      size="icon"
      title={copied ? copiedLabel : copyLabel}
      type="button"
      variant="ghost"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  )
}
