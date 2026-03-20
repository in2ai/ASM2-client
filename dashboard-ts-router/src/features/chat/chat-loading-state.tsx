import { Skeleton } from '@/components/ui/skeleton'

export function ChatSidebarLoadingState() {
  return (
    <div className="space-y-3 p-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="space-y-2 rounded-2xl border p-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}

export function ChatConversationLoadingState() {
  return (
    <div className="space-y-6 p-6">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className={`flex ${index % 2 === 0 ? 'justify-start' : 'justify-end'}`}
        >
          <div className="max-w-[75%] space-y-2 rounded-3xl border p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  )
}
