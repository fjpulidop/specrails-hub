import { useEffect, useRef } from 'react'
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
  const startedRef = useRef(false)

  // Start a new conversation with the propose-spec command when modal opens
  useEffect(() => {
    if (!open || !chat || startedRef.current) return
    startedRef.current = true
    chat.startWithMessage('/specrails:propose-spec')
  }, [open, chat])

  // Reset tracking flag when modal closes
  useEffect(() => {
    if (!open) startedRef.current = false
  }, [open])

  const conversation = chat?.conversations[chat.activeTabIndex] ?? null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl flex flex-col gap-0 p-0 overflow-hidden h-[580px]">
        <DialogHeader className="px-4 py-3 border-b border-border/40 shrink-0">
          <DialogTitle className="text-sm">Propose Spec</DialogTitle>
        </DialogHeader>

        {conversation ? (
          <>
            <div className="flex-1 overflow-hidden">
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
