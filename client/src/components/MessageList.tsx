import { useEffect, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import type { ChatMessage } from '../types'

interface MessageListProps {
  messages: ChatMessage[]
  streamingText: string
  isStreaming: boolean
  onConfirmCommand: (command: string) => void
  onDismissCommand: (command: string) => void
}

export function MessageList({
  messages,
  streamingText,
  isStreaming,
  onConfirmCommand,
  onDismissCommand,
}: MessageListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledRef = useRef(false)

  // Detect manual scroll-up
  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    userScrolledRef.current = distanceFromBottom > 100
  }

  // Auto-scroll to bottom when messages or streaming text changes
  useEffect(() => {
    if (userScrolledRef.current) return
    sentinelRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto py-2"
      onScroll={handleScroll}
    >
      {messages.length === 0 && !isStreaming && (
        <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
          <MessageSquare className="w-6 h-6 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
          <p className="text-xs text-muted-foreground/60 max-w-[200px]">
            Ask Claude anything about your project to get started
          </p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          onConfirmCommand={onConfirmCommand}
          onDismissCommand={onDismissCommand}
        />
      ))}

      {isStreaming && streamingText && (
        <div className="flex justify-start px-3 py-1">
          <div className="max-w-[95%] rounded-2xl rounded-bl-sm bg-dracula-current/30 px-3 py-2 text-xs text-foreground whitespace-pre-wrap">
            {streamingText}
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="px-3 py-1">
          <span className="animate-pulse text-xs text-muted-foreground">...</span>
        </div>
      )}

      <div ref={sentinelRef} />
    </div>
  )
}
