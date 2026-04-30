import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Plus, Loader2, FileText, Image as ImageIcon } from 'lucide-react'
import { Button } from '../ui/button'
import {
  type SpecDraft,
  type SpecDraftField,
  type SpecDraftPriority,
} from '../../lib/spec-draft'
import type { Attachment } from '../../types'

interface SpecDraftPanelProps {
  draft: SpecDraft
  ready: boolean
  /** Field keys updated by the latest Claude turn — used to flash on change. */
  flashFields: SpecDraftField[]
  /** Update a single field manually (records as user override). */
  onFieldChange: <K extends SpecDraftField>(key: K, value: SpecDraft[K]) => void
  /** Submitting commit. */
  isCreating: boolean
  /** Called when the user clicks Create Spec. */
  onCreate: () => void
  /** Files accumulated across the conversation; migrated to the new ticket on Create. */
  attachments?: Attachment[]
  /** Detach a file from the pending spec (deletes server-side). */
  onRemoveAttachment?: (id: string) => void
}

const PRIORITIES: SpecDraftPriority[] = ['low', 'medium', 'high', 'critical']

export function SpecDraftPanel({
  draft,
  ready,
  flashFields,
  onFieldChange,
  isCreating,
  onCreate,
  attachments = [],
  onRemoveAttachment,
}: SpecDraftPanelProps) {
  const canCreate = draft.title.trim().length > 0 && !isCreating

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-5 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary/70" />
          <h3 className="text-sm font-semibold">Draft</h3>
        </div>
        {ready && (
          <span
            role="status"
            aria-live="polite"
            className="text-[10px] text-primary/80 bg-primary/10 rounded-full px-2 py-0.5 flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            Draft ready
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <Field label="Title" flash={flashFields.includes('title')}>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => onFieldChange('title', e.target.value)}
            placeholder="Concise, action-oriented title…"
            className="w-full px-3 py-2 text-sm rounded-md border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Spec title"
          />
        </Field>

        <Field label="Priority" flash={flashFields.includes('priority')}>
          <select
            value={draft.priority}
            onChange={(e) => onFieldChange('priority', e.target.value as SpecDraftPriority)}
            className="w-full px-3 py-2 text-sm rounded-md border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Spec priority"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Labels" flash={flashFields.includes('labels')}>
          <LabelsEditor
            labels={draft.labels}
            onChange={(labels) => onFieldChange('labels', labels)}
          />
        </Field>

        <Field label="Description" flash={flashFields.includes('description')}>
          <textarea
            value={draft.description}
            onChange={(e) => onFieldChange('description', e.target.value)}
            rows={5}
            placeholder="What problem is this solving? What changes? Why now?"
            className="w-full px-3 py-2 text-sm rounded-md border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            aria-label="Spec description"
          />
        </Field>

        <Field label="Acceptance Criteria" flash={flashFields.includes('acceptanceCriteria')}>
          <CriteriaEditor
            items={draft.acceptanceCriteria}
            onChange={(items) => onFieldChange('acceptanceCriteria', items)}
          />
        </Field>
      </div>

      {/* Sticky footer: attachments (if any) + Create button. Pinning the
          attachments here guarantees the user always sees what files will
          be linked to the spec, regardless of the scroll position. */}
      {attachments.length > 0 && (
        <div className="flex-shrink-0 px-5 py-3 border-t border-border/40 bg-card/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
              Attachments ({attachments.length})
            </span>
            <span className="text-[10px] text-muted-foreground/60">linked on Create</span>
          </div>
          <AttachmentsList items={attachments} onRemove={onRemoveAttachment} />
        </div>
      )}

      <div className="flex-shrink-0 px-5 py-3 border-t border-border/40 bg-card/30">
        <Button
          size="default"
          className={`w-full gap-2 ${ready ? 'animate-pulse' : ''}`}
          variant={ready ? 'default' : 'outline'}
          disabled={!canCreate}
          onClick={onCreate}
          aria-label="Create spec from current draft"
        >
          {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Create Spec
        </Button>
        {!canCreate && !isCreating && (
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            A title is needed to create
          </p>
        )}
      </div>
    </div>
  )
}

function Field({ label, flash, children }: { label: string; flash: boolean; children: React.ReactNode }) {
  const [active, setActive] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!flash) return
    setActive(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setActive(false), 700)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [flash])
  return (
    <div className={`space-y-1.5 transition-colors duration-200 ${active ? 'bg-primary/[0.06] -mx-2 px-2 py-1 rounded' : ''}`}>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}

function LabelsEditor({ labels, onChange }: { labels: string[]; onChange: (labels: string[]) => void }) {
  const [input, setInput] = useState('')
  function add() {
    const v = input.trim()
    if (!v || labels.includes(v)) {
      setInput('')
      return
    }
    onChange([...labels, v])
    setInput('')
  }
  function remove(label: string) {
    onChange(labels.filter((l) => l !== label))
  }
  return (
    <div className="flex flex-wrap gap-1.5 p-1.5 rounded-md border border-border/50 bg-background min-h-[36px]">
      {labels.map((label) => (
        <span
          key={label}
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary/90"
        >
          {label}
          <button
            type="button"
            onClick={() => remove(label)}
            className="hover:text-foreground"
            aria-label={`Remove label ${label}`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !input && labels.length > 0) {
            onChange(labels.slice(0, -1))
          }
        }}
        onBlur={add}
        placeholder={labels.length === 0 ? 'Add labels…' : ''}
        className="flex-1 min-w-[80px] bg-transparent text-xs focus:outline-none"
        aria-label="Add label"
      />
    </div>
  )
}

function AttachmentsList({ items, onRemove }: { items: Attachment[]; onRemove?: (id: string) => void }) {
  return (
    <ul className="space-y-1" aria-label="Accumulated attachments">
      {items.map((att) => {
        const isImage = att.mimeType.startsWith('image/')
        const Icon = isImage ? ImageIcon : FileText
        return (
          <li
            key={att.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border/40 bg-card/40 text-xs"
          >
            <Icon className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
            <span className="flex-1 truncate" title={`${att.filename} · ${formatBytes(att.size)}`}>
              {att.filename}
            </span>
            <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">{formatBytes(att.size)}</span>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(att.id)}
                className="text-muted-foreground hover:text-destructive flex-shrink-0"
                aria-label={`Remove ${att.filename}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function CriteriaEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  function update(idx: number, value: string) {
    const next = items.slice()
    next[idx] = value
    onChange(next)
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx))
  }
  function add() {
    onChange([...items, ''])
  }
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">•</span>
          <input
            value={item}
            onChange={(e) => update(i, e.target.value)}
            placeholder="Testable outcome…"
            className="flex-1 px-2 py-1 text-xs rounded border border-border/50 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
            aria-label={`Acceptance criterion ${i + 1}`}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Remove criterion ${i + 1}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        aria-label="Add acceptance criterion"
      >
        <Plus className="w-3 h-3" /> Add criterion
      </button>
    </div>
  )
}
