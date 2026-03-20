import { MessageSquare } from 'lucide-react'
import { cn } from '../lib/utils'
import { ChatHeader } from './ChatHeader'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import type { UseChatReturn } from '../hooks/useChat'
import type { HubProject } from '../hooks/useHub'

interface ChatPanelProps {
  chat: UseChatReturn
  project?: HubProject
}

export function ChatPanel({ chat, project = undefined }: ChatPanelProps) {
  const {
    conversations,
    activeTabIndex,
    isPanelOpen,
    setActiveTabIndex,
    togglePanel,
    createConversation,
    deleteConversation,
    sendMessage,
    startWithMessage,
    abortStream,
    confirmCommand,
    dismissCommandProposal,
  } = chat

  const activeStreamCount = conversations.filter((c) => c.isStreaming).length
  const activeConversation = conversations[activeTabIndex] ?? null

  // Collapsed state: narrow strip
  if (!isPanelOpen) {
    return (
      <div
        className="flex w-10 shrink-0 cursor-pointer flex-col items-center border-l border-border/30 bg-background/80 backdrop-blur-sm pt-6"
        onClick={togglePanel}
        title="Open chat"
      >
        <div className="relative">
          <MessageSquare className="w-4 h-4 text-dracula-purple" />
          {activeStreamCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-dracula-pink text-[8px] font-bold text-white">
              {activeStreamCount}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-border/30 bg-background/80 backdrop-blur-sm">
      <ChatHeader
        title={activeConversation?.title ?? null}
        projectName={project?.name}
        canCreateNew={conversations.length < 3}
        hasActiveConversation={activeConversation !== null}
        onToggle={togglePanel}
        onNewConversation={() => createConversation()}
        onDeleteConversation={() => {
          if (activeConversation) deleteConversation(activeConversation.id)
        }}
      />

      {/* Tab bar */}
      {conversations.length > 0 && (
        <div className="flex shrink-0 items-center gap-0 border-b border-border/30 overflow-x-auto">
          {conversations.map((conv, i) => (
            <div
              key={conv.id}
              className={cn(
                'group flex min-w-0 flex-1 cursor-pointer items-center gap-1 px-2.5 py-1.5',
                'text-[10px] transition-colors',
                i === activeTabIndex
                  ? 'border-b-2 border-dracula-purple text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
              )}
              onClick={() => setActiveTabIndex(i)}
            >
              <span className="truncate max-w-[70px]">
                {conv.title ?? `Chat ${i + 1}`}
              </span>
              {conv.isStreaming && (
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-dracula-purple" />
              )}
              <button
                className="ml-auto shrink-0 hidden group-hover:block text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteConversation(conv.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Conversation view */}
      {activeConversation ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <MessageList
            messages={activeConversation.messages}
            streamingText={activeConversation.streamingText}
            isStreaming={activeConversation.isStreaming}
            project={project}
            onConfirmCommand={confirmCommand}
            onDismissCommand={(cmd) => dismissCommandProposal(activeConversation.id, cmd)}
            onSuggestion={(text) => sendMessage(activeConversation.id, text)}
          />
          <ChatInput
            conversationId={activeConversation.id}
            model={activeConversation.model}
            hasMessages={activeConversation.messages.length > 0}
            isStreaming={activeConversation.isStreaming}
            onSend={sendMessage}
            onAbort={abortStream}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
          {project && (
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="text-xs font-medium text-foreground">{project.name}</p>
              <p className="text-[10px] text-muted-foreground/60 max-w-[180px] truncate">{project.path}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground/70">
            {project ? 'Start a conversation about this project' : 'No conversations yet'}
          </p>
          {project && (
            <div className="flex flex-col gap-1.5 w-full">
              {['What\'s the project status?', 'Show recent job failures', 'What commands should I run?', 'Explain the codebase'].map((suggestion) => (
                <button
                  key={suggestion}
                  className="rounded-md border border-border/30 px-2.5 py-1.5 text-left text-[11px] text-muted-foreground hover:border-dracula-purple/40 hover:text-foreground transition-colors"
                  onClick={() => startWithMessage(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          <button
            className="mt-1 rounded-md bg-dracula-purple/20 px-3 py-1.5 text-xs text-dracula-purple hover:bg-dracula-purple/30 transition-colors"
            onClick={() => createConversation()}
          >
            New conversation
          </button>
        </div>
      )}
    </div>
  )
}
