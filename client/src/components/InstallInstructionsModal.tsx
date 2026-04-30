import { useState } from 'react'
import { Check, Copy, RefreshCw, ExternalLink, ClipboardList } from 'lucide-react'
import { API_ORIGIN } from '../lib/origin'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import { Button } from './ui/button'
import { cn } from '../lib/utils'
import type { Platform, SetupPrerequisitesStatus } from '../hooks/usePrerequisites'

interface Props {
  open: boolean
  onClose: () => void
  status: SetupPrerequisitesStatus | null
  onRecheck: () => void
  isRechecking?: boolean
}

interface PlatformInstructions {
  title: string
  intro?: string
  commands: { label: string; command: string }[]
  links: { label: string; url: string }[]
  note?: string
}

const INSTRUCTIONS: Record<Platform, PlatformInstructions> = {
  darwin: {
    title: 'macOS',
    intro: 'Homebrew gets you both tools in one line. If you do not have brew, use the official downloads.',
    commands: [
      { label: 'Install Node.js and Git via Homebrew', command: 'brew install node git' },
    ],
    links: [
      { label: 'Node.js (official)', url: 'https://nodejs.org/en/download' },
      { label: 'Git (official)', url: 'https://git-scm.com/downloads' },
      { label: 'Homebrew', url: 'https://brew.sh' },
    ],
  },
  win32: {
    title: 'Windows',
    intro: 'Winget ships with Windows 11 and recent Windows 10. Open PowerShell or Terminal and run:',
    commands: [
      { label: 'Install Node.js LTS', command: 'winget install OpenJS.NodeJS.LTS' },
      { label: 'Install Git', command: 'winget install Git.Git' },
    ],
    links: [
      { label: 'Node.js (official)', url: 'https://nodejs.org/en/download' },
      { label: 'Git for Windows (official)', url: 'https://git-scm.com/download/win' },
    ],
    note: 'After install, restart SpecRails Hub so Windows refreshes PATH.',
  },
  linux: {
    title: 'Linux',
    intro: 'Use your distro package manager:',
    commands: [
      { label: 'Debian / Ubuntu', command: 'sudo apt install -y nodejs npm git' },
      { label: 'Fedora / RHEL', command: 'sudo dnf install -y nodejs npm git' },
    ],
    links: [
      { label: 'Node.js (official)', url: 'https://nodejs.org/en/download' },
      { label: 'Git (official)', url: 'https://git-scm.com/downloads' },
    ],
  },
}

const ALL_PLATFORMS: Platform[] = ['darwin', 'win32', 'linux']

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to fallback
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

function CopyButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const ok = await copyToClipboard(command)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-7 px-2 gap-1.5 text-[11px]"
      data-testid="install-copy-button"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          Copy
        </>
      )}
    </Button>
  )
}

function PlatformSection({ platform, primary }: { platform: Platform; primary: boolean }) {
  const instr = INSTRUCTIONS[platform]
  return (
    <section
      data-testid={`install-section-${platform}`}
      className={cn(
        'rounded-lg border px-3 py-3',
        primary ? 'border-border/40 bg-background/40' : 'border-border/20 bg-background/20',
      )}
    >
      <h3 className="text-sm font-semibold text-foreground">{instr.title}</h3>
      {instr.intro && (
        <p className="mt-1 text-[11px] text-muted-foreground">{instr.intro}</p>
      )}
      <div className="mt-2 space-y-2">
        {instr.commands.map((c) => (
          <div key={c.command} className="rounded-md border border-border/30 bg-background/60 px-2 py-2">
            <p className="text-[11px] text-muted-foreground mb-1">{c.label}</p>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs text-foreground font-mono break-all">{c.command}</code>
              <CopyButton command={c.command} />
            </div>
          </div>
        ))}
      </div>
      {instr.links.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {instr.links.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-accent-info hover:underline"
              >
                {link.label}
                <ExternalLink className="w-3 h-3" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {instr.note && (
        <p className="mt-2 text-[11px] text-accent-highlight">{instr.note}</p>
      )}
    </section>
  )
}

function CopyDiagnosticsButton() {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')

  const onClick = async () => {
    setState('copying')
    try {
      const res = await fetch(`${API_ORIGIN}/api/hub/setup-prerequisites?diagnostic=1`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      await navigator.clipboard.writeText(JSON.stringify(json, null, 2))
      setState('copied')
      setTimeout(() => setState('idle'), 1800)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2400)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={state === 'copying'}
      className="gap-1.5 text-[11px]"
      data-testid="copy-diagnostics-button"
    >
      {state === 'copied' ? (
        <Check className="w-3 h-3 text-accent-success" />
      ) : (
        <ClipboardList className="w-3 h-3" />
      )}
      {state === 'copied'
        ? 'Diagnostics copied'
        : state === 'error'
          ? 'Copy failed'
          : 'Copy diagnostics'}
    </Button>
  )
}

export function InstallInstructionsModal({ open, onClose, status, onRecheck, isRechecking }: Props) {
  const [showOthers, setShowOthers] = useState(false)
  const platform: Platform = status?.platform ?? 'darwin'
  const others = ALL_PLATFORMS.filter((p) => p !== platform)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Install developer tools</DialogTitle>
          <DialogDescription>
            SpecRails needs Node.js, npm, npx, and Git on PATH. Pick the snippet for your OS, run it,
            then click "I installed it, recheck".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <PlatformSection platform={platform} primary />

          <button
            type="button"
            onClick={() => setShowOthers((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            data-testid="install-toggle-others"
          >
            {showOthers ? 'Hide other platforms' : 'Show other platforms'}
          </button>

          {showOthers && (
            <div className="space-y-3">
              {others.map((p) => (
                <PlatformSection key={p} platform={p} primary={false} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-2">
          <CopyDiagnosticsButton />
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onRecheck}
              disabled={isRechecking}
              className="gap-1.5"
              data-testid="install-recheck-button"
            >
              <RefreshCw className={cn('w-3 h-3', isRechecking && 'animate-spin')} />
              I installed it, recheck
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
