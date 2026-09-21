import { cn } from '@/lib/utils'
import { Bot, User2 } from 'lucide-react'

export function BubbleAvatar({ isUser }: Readonly<{ isUser: boolean }>) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border',
        isUser
          ? 'bg-primary/10 text-primary border-primary/20'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {isUser ? <User2 className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
    </div>
  )
}
