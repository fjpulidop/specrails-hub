import { Outlet } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { useEffect, useRef, useState } from 'react'
import { TooltipProvider } from './ui/tooltip'
import { ProjectNavbar } from './ProjectNavbar'
import { StatusBar } from './StatusBar'
import { ChatPanel } from './ChatPanel'
import { usePipeline } from '../hooks/usePipeline'
import { useChat, ChatContext } from '../hooks/useChat'
import { useSharedWebSocket } from '../hooks/useSharedWebSocket'
import type { HubProject } from '../hooks/useHub'
import { FEATURE_CHAT_ENABLED } from '../lib/feature-flags'

interface ProjectLayoutProps {
  project: HubProject
}

export function ProjectLayout({ project }: ProjectLayoutProps) {
  const { connectionStatus } = usePipeline()
  const chat = useChat()
  const { registerHandler, unregisterHandler } = useSharedWebSocket()
  const [budgetExceeded, setBudgetExceeded] = useState<{ dailySpend: number; budget: number } | null>(null)
  const projectIdRef = useRef(project.id)
  projectIdRef.current = project.id

  useEffect(() => {
    const id = `cost-alerts-${project.id}`
    registerHandler(id, (raw) => {
      const msg = raw as { type: string; projectId?: string; jobId?: string; cost?: number; threshold?: number; dailySpend?: number; budget?: number; queuePaused?: boolean; hubDailySpend?: number; hubBudget?: number }
      if (msg.projectId !== undefined && msg.projectId !== '' && msg.projectId !== projectIdRef.current) return
      if (msg.type === 'cost_alert') {
        toast.warning('Cost alert', {
          description: `Job cost $${(msg.cost ?? 0).toFixed(4)} — threshold is $${(msg.threshold ?? 0).toFixed(2)}`,
        })
      } else if (msg.type === 'daily_budget_exceeded') {
        toast.error('Daily budget exceeded', {
          description: `Spent $${(msg.dailySpend ?? 0).toFixed(2)} of $${(msg.budget ?? 0).toFixed(2)} today. Queue paused.`,
          duration: Infinity,
        })
        setBudgetExceeded({ dailySpend: msg.dailySpend ?? 0, budget: msg.budget ?? 0 })
      } else if (msg.type === 'hub_daily_budget_exceeded') {
        toast.error('Hub daily budget exceeded', {
          description: `Total hub spend $${(msg.hubDailySpend ?? 0).toFixed(2)} of $${(msg.hubBudget ?? 0).toFixed(2)}. Queue paused.`,
          duration: Infinity,
        })
      }
    })
    return () => unregisterHandler(id)
  }, [project.id, registerHandler, unregisterHandler])

  return (
    <TooltipProvider delayDuration={400}>
      <ChatContext.Provider value={chat}>
      <div className="flex flex-col h-full overflow-hidden">
        <ProjectNavbar project={project} />
        {budgetExceeded && (
          <div className="flex items-center justify-between px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-xs">
            <span className="text-destructive font-medium">
              Daily budget exceeded — spent ${budgetExceeded.dailySpend.toFixed(2)} of ${budgetExceeded.budget.toFixed(2)}. Queue is paused.
            </span>
            <button
              type="button"
              onClick={() => setBudgetExceeded(null)}
              className="text-muted-foreground hover:text-foreground ml-4 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
          {FEATURE_CHAT_ENABLED && <ChatPanel chat={chat} project={project} />}
        </div>
        <StatusBar connectionStatus={connectionStatus} />
      </div>
      </ChatContext.Provider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          unstyled: true,
          classNames: {
            toast: 'glass-card border border-border/30 text-foreground text-xs p-3 rounded-lg flex items-start gap-2 w-[356px]',
            title: 'font-medium',
            description: 'text-muted-foreground mt-0.5',
          },
        }}
      />
    </TooltipProvider>
  )
}
