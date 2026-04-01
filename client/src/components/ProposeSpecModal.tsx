import { useEffect, useState, useCallback, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { useChatContext } from '../hooks/useChat'

interface ProposeSpecModalProps {
  open: boolean
  onClose: () => void
}

export function ProposeSpecModal({ open, onClose }: ProposeSpecModalProps) {
  const chat = useChatContext()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const conversationIdRef = useRef<string | null>(null)

  // Start a fresh conversation when the modal opens;
  // kill the Claude process when it closes.
  useEffect(() => {
    if (!open || !chat) return
    conversationIdRef.current = null
    setConversationId(null)

    let cancelled = false
    ;(async () => {
      const id = await chat.startWithMessage('/specrails:propose-spec')
      if (cancelled || !id) return
      conversationIdRef.current = id
      setConversationId(id)
    })()

    return () => {
      cancelled = true
      const id = conversationIdRef.current
      if (id) chat.abortStream(id)
      conversationIdRef.current = null
      setConversationId(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only show the conversation created for this modal session
  const conversation = chat?.conversations.find((c) => c.id === conversationId) ?? null

  // Prevent closing on overlay/background click — only X button should close
  const preventInteractOutside = useCallback((e: Event) => {
    e.preventDefault()
  }, [])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-2xl flex flex-col gap-0 p-0 overflow-hidden h-[580px]"
        onInteractOutside={preventInteractOutside}
        onPointerDownOutside={preventInteractOutside}
      >
        <DialogHeader className="px-4 py-3 border-b border-border/40 shrink-0">
          <DialogTitle className="text-sm">Add Spec</DialogTitle>
        </DialogHeader>

        {conversation ? (
          <>
            <div className="flex-1 flex flex-col overflow-hidden">
              <MessageList
                messages={conversation.messages}
                streamingText={conversation.streamingText}
                isStreaming={conversation.isStreaming}
                onConfirmCommand={(cmd) => chat!.confirmCommand(cmd)}
                onDismissCommand={(cmd) => chat!.dismissCommandProposal(conversation.id, cmd)}
              />
            </div>
            <div className="border-t border-border/40 shrink-0">
              <ChatInput
                conversationId={conversation.id}
                model={conversation.model}
                hasMessages={conversation.messages.length > 0}
                isStreaming={conversation.isStreaming}
                onSend={chat!.sendMessage}
                onAbort={chat!.abortStream}
                onModelChange={(model) => chat!.changeConversationModel(conversation.id, model)}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Starting session…
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
