import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Play, Pencil, Trash2, Plus, BookTemplate } from 'lucide-react'
import { getApiBase } from '../lib/api'
import type { CommandInfo, JobTemplate } from '../types'
import { Button } from './ui/button'
import { CreateTemplateDialog } from './CreateTemplateDialog'

interface TemplateLibraryProps {
  templates: JobTemplate[]
  isLoading: boolean
  onTemplatesChanged: () => void
  commands?: CommandInfo[]
}

export function TemplateLibrary({ templates, isLoading, onTemplatesChanged, commands = [] }: TemplateLibraryProps) {
  const { t } = useTranslation('commands')
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<JobTemplate | null>(null)
  const [running, setRunning] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<Set<string>>(new Set())

  const handleRun = useCallback(async (template: JobTemplate) => {
    setRunning((prev) => new Set(prev).add(template.id))
    try {
      const res = await fetch(`${getApiBase()}/templates/${template.id}/run`, { method: 'POST' })
      const data = await res.json() as { jobIds?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? t('templates.errors.runFailed'))
      const count = data.jobIds?.length ?? 0
      toast.success(t('templates.toasts.queuedJobs', { count, name: template.name }))
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRunning((prev) => { const s = new Set(prev); s.delete(template.id); return s })
    }
  }, [t])

  const handleDelete = useCallback(async (template: JobTemplate) => {
    if (!window.confirm(t('templates.confirmDelete', { name: template.name }))) return
    setDeleting((prev) => new Set(prev).add(template.id))
    try {
      const res = await fetch(`${getApiBase()}/templates/${template.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? t('templates.errors.deleteFailed'))
      }
      toast.success(t('templates.toasts.deleted', { name: template.name }))
      onTemplatesChanged()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(template.id); return s })
    }
  }, [onTemplatesChanged, t])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 rounded-lg border border-border/40 bg-card/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <BookTemplate className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{t('templates.emptyState.title')}</p>
        <p className="text-xs text-muted-foreground/60">{t('templates.emptyState.hint')}</p>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} className="gap-1.5 mt-1">
          <Plus className="h-3.5 w-3.5" />
          {t('templates.createButton')}
        </Button>
        <CreateTemplateDialog
          open={createOpen}
          commands={commands}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { onTemplatesChanged(); setCreateOpen(false) }}
        />
      </div>
    )
  }

  return (
    <>
      <div className="flex justify-end mb-2">
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {t('templates.newButton')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="rounded-lg border border-border/40 bg-card/60 px-4 py-3 flex flex-col gap-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{tpl.name}</p>
                {tpl.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{tpl.description}</p>
                )}
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {t('templates.steps', { count: tpl.commands.length })}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  aria-label={t('templates.aria.edit')}
                  onClick={() => setEditTarget(tpl)}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={t('templates.aria.delete')}
                  onClick={() => handleDelete(tpl)}
                  disabled={deleting.has(tpl.id)}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-muted/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              {tpl.commands.slice(0, 3).map((cmd, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono bg-muted/40 text-muted-foreground"
                >
                  {cmd.length > 30 ? cmd.slice(0, 28) + '…' : cmd}
                </span>
              ))}
              {tpl.commands.length > 3 && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-muted/40 text-muted-foreground">
                  {t('templates.moreCommands', { count: tpl.commands.length - 3 })}
                </span>
              )}
            </div>

            <Button
              size="sm"
              onClick={() => handleRun(tpl)}
              disabled={running.has(tpl.id)}
              className="w-full gap-1.5 h-7 text-xs"
            >
              <Play className="h-3 w-3" />
              {running.has(tpl.id) ? t('templates.queuing') : t('templates.run')}
            </Button>
          </div>
        ))}
      </div>

      <CreateTemplateDialog
        open={createOpen}
        commands={commands}
        onClose={() => setCreateOpen(false)}
        onSaved={() => { onTemplatesChanged(); setCreateOpen(false) }}
      />

      <CreateTemplateDialog
        open={editTarget != null}
        template={editTarget}
        commands={commands}
        onClose={() => setEditTarget(null)}
        onSaved={() => { onTemplatesChanged(); setEditTarget(null) }}
      />
    </>
  )
}
