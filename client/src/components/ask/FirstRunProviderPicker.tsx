// Inline picker shown inside the modal when no `ask_answer_provider` is set
// and both Claude and Codex are detected.

import { useState } from 'react'
import type { AskProvidersInfo } from '../../lib/ask-client'
import { API_ORIGIN } from '../../lib/origin'

export interface FirstRunProviderPickerProps {
  info: AskProvidersInfo
  onPicked: (provider: 'claude' | 'codex' | 'none') => void
}

const PROVIDER_META: Record<string, { label: string; model: string; hint: string }> = {
  claude: { label: 'Claude', model: 'Haiku 4.5', hint: '~2s · ~$0.005' },
  codex: { label: 'Codex', model: 'gpt-4o-mini', hint: '~3s · ~$0.003' },
}

export function FirstRunProviderPicker({ info, onPicked }: FirstRunProviderPickerProps) {
  const [saving, setSaving] = useState<string | null>(null)
  const choices = info.detected.providers.filter((p) => p.available && p.executable)

  const pick = async (provider: 'claude' | 'codex' | 'none') => {
    setSaving(provider)
    try {
      await fetch(`${API_ORIGIN}/api/hub/ask-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      onPicked(provider)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Choose an AI answer provider</h2>
        <p className="text-xs text-foreground/60 mt-1">You have multiple CLIs installed. Which one should Ask the Hub use? You can change this later in Settings.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {choices.map((c) => {
          const meta = PROVIDER_META[c.id] ?? { label: c.displayName, model: '', hint: '' }
          return (
            <button
              key={c.id}
              disabled={saving !== null}
              onClick={() => pick(c.id as 'claude' | 'codex')}
              className="rounded-xl border border-surface bg-background-deep/40 p-4 text-left hover:border-accent-primary disabled:opacity-50 transition-colors"
            >
              <div className="text-sm font-semibold text-foreground">{meta.label}</div>
              <div className="text-xs text-foreground/60 mt-1">{meta.model}</div>
              <div className="text-[11px] text-foreground/40 mt-2">{meta.hint}</div>
              {saving === c.id && <div className="text-[11px] text-accent-primary mt-2">Saving…</div>}
            </button>
          )
        })}
      </div>
      <button
        disabled={saving !== null}
        onClick={() => pick('none')}
        className="w-full rounded-lg border border-dashed border-surface px-3 py-2 text-xs text-foreground/60 hover:border-foreground/40 disabled:opacity-50"
      >
        Search only (no AI) — instant, free, fully local
      </button>
    </div>
  )
}
