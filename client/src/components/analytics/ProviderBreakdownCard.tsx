import type { ByProviderEntry, SpendingResponse } from '../../types/spending'

interface Props {
  data: SpendingResponse | null
  loading: boolean
}

const PROVIDER_LABEL: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
}

const PROVIDER_ACCENT: Record<string, string> = {
  claude: 'bg-accent-info',
  codex: 'bg-accent-highlight',
}

function fmtUsd(v: number): string {
  if (v >= 100) return `$${v.toFixed(0)}`
  if (v >= 10) return `$${v.toFixed(1)}`
  if (v >= 0.01) return `$${v.toFixed(2)}`
  return `$${v.toFixed(4)}`
}

function providerLabel(id: string): string {
  return PROVIDER_LABEL[id] ?? id
}

function providerAccent(id: string): string {
  return PROVIDER_ACCENT[id] ?? 'bg-accent-secondary'
}

export function ProviderBreakdownCard({ data, loading }: Props) {
  if (loading && !data) {
    return <div className="h-32 rounded-xl border border-border/40 bg-card/40 animate-pulse" />
  }
  if (!data || data.byProvider.length === 0) {
    // Single-provider projects (or empty datasets) skip this widget — the
    // Hero already shows the totals, and adding "1 provider: claude" is
    // visual noise.
    return null
  }
  // Don't render the card on projects that only ever invoke one provider.
  if (data.byProvider.length === 1) return null

  const total = data.byProvider.reduce(
    (acc, p) => acc + p.costUsd + p.estimatedCostUsd,
    0,
  )

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            By provider
          </div>
          <div className="text-xs text-muted-foreground/70 mt-0.5">
            How cost splits across the AI CLIs in this project. The{' '}
            <span className="font-medium">~</span> prefix marks rows where
            cost is estimated from the local pricing table (the provider
            does not report it natively).
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div className="text-xs text-muted-foreground italic">
          No cost recorded yet in this window.
        </div>
      ) : (
        <>
          <div className="h-2 w-full rounded-full overflow-hidden bg-background-deep flex mb-3">
            {data.byProvider.map((p) => {
              const sum = p.costUsd + p.estimatedCostUsd
              const pct = total > 0 ? (sum / total) * 100 : 0
              if (pct === 0) return null
              return (
                <div
                  key={p.provider}
                  className={`h-full ${providerAccent(p.provider)}`}
                  style={{ width: `${pct}%` }}
                  title={`${providerLabel(p.provider)}: ${fmtUsd(sum)} (${p.count})`}
                />
              )
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.byProvider.map((p) => (
              <ProviderRow key={p.provider} entry={p} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ProviderRow({ entry }: { entry: ByProviderEntry }) {
  const sum = entry.costUsd + entry.estimatedCostUsd
  const allEstimated = entry.costUsd === 0 && entry.estimatedCostUsd > 0
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border/30 px-2.5 py-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${providerAccent(entry.provider)}`} />
      <span className="text-xs font-medium">{providerLabel(entry.provider)}</span>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {entry.count} run{entry.count === 1 ? '' : 's'}
      </span>
      <span className="ml-auto text-xs font-medium tabular-nums">
        {allEstimated ? '~' : ''}{fmtUsd(sum)}
      </span>
    </div>
  )
}
