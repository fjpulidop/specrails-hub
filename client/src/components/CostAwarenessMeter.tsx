import { useTranslation } from 'react-i18next'
import {
  tierFromScope, estimateInputTokens, estimateCostUsd, timeHintForTier,
  type ContextScope, type ContextBudget, type Tier,
} from '../types/context-scope'

interface Props {
  scope: ContextScope
  budget: ContextBudget | null
  budgetError: boolean
  model: string
}

const TIERS: Tier[] = ['Light', 'Medium', 'Heavy', 'Deep']

const TIER_ACCENT_CLASS: Record<Tier, string> = {
  Light: 'bg-accent-success',
  Medium: 'bg-accent-info',
  Heavy: 'bg-accent-warning',
  Deep: 'bg-accent-secondary',
}

function formatTokens(n: number): string {
  if (n >= 1000) return `~${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return `~${n}`
}

function formatCost(n: number): string {
  if (n < 0.01) return `~$${n.toFixed(4)}`
  return `~$${n.toFixed(2)}`
}

export function CostAwarenessMeter({ scope, budget, budgetError, model }: Props) {
  const { t } = useTranslation('addspec')
  const tier = tierFromScope(scope)
  const activeIdx = TIERS.indexOf(tier)

  return (
    <div className="flex flex-col gap-1.5" data-testid="cost-awareness-meter">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          {t('costMeter.heading')}
        </span>
        <span className="text-[11px] font-medium text-foreground" data-testid="meter-tier">{tier}</span>
      </div>
      <div className="flex items-center gap-1" role="meter" aria-label={t('costMeter.meterAriaLabel')} aria-valuetext={tier}>
        {TIERS.map((t, i) => (
          <div
            key={t}
            data-testid={`meter-segment-${t.toLowerCase()}`}
            className={`h-2 flex-1 rounded-sm transition-colors duration-150 ${
              i <= activeIdx ? TIER_ACCENT_CLASS[tier] : 'bg-card/40 border border-border/30'
            }`}
          />
        ))}
      </div>
      <div className="text-[11px] text-muted-foreground" data-testid="meter-numeric">
        {budgetError || !budget ? (
          <span>{t('costMeter.estimateUnavailable')}</span>
        ) : (
          <span>
            {formatTokens(estimateInputTokens(scope, budget))} tok ·{' '}
            {formatCost(estimateCostUsd(scope, budget, model))} ·{' '}
            {timeHintForTier(tier)}
          </span>
        )}
      </div>
    </div>
  )
}
