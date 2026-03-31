import { useEffect, useState, useCallback } from 'react'
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

  // Always start a fresh conversation when the modal opens
  useEffect(() => {
    if (!open || !chat) return
    setConversationId(null)
    void chat.startWithMessage('/sr:propose-spec')
    return () => {
      setConversationId(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track the conversation created for this session
  useEffect(() => {
    if (!open || !chat || conversationId) return
    const convo = chat.conversations[chat.activeTabIndex]
    if (convo) setConversationId(convo.id)
  }, [open, chat, chat?.conversations, chat?.activeTabIndex, conversationId])

  // Get the conversation matching this modal session
  const conversation = chat?.conversations.find((c) => c.id === conversationId)
    ?? (open ? chat?.conversations[chat.activeTabIndex] ?? null : null)

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
          <DialogTitle className="text-sm">Propose Spec</DialogTitle>
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
