import { useProjectCache } from '../hooks/useProjectCache'
import { useHub } from '../hooks/useHub'
import { getApiBase } from '../lib/api'

interface HealthMetrics {
  healthScore: number
}

export function HealthIndicatorBadge() {
  const { activeProjectId } = useHub()

  const { data: metrics } = useProjectCache<HealthMetrics | null>({
    namespace: 'metrics',
    projectId: activeProjectId,
    initialValue: null,
    fetcher: async () => {
      const res = await fetch(`${getApiBase()}/metrics`)
      if (!res.ok) return null
      return res.json() as Promise<HealthMetrics>
    },
    pollInterval: 60_000,
  })

  if (!metrics) return null

  const { healthScore } = metrics
  const color = healthScore >= 80
    ? 'bg-[#50fa7b]/15 text-[#50fa7b] border-[#50fa7b]/30'
    : healthScore >= 50
    ? 'bg-[#f1fa8c]/15 text-[#f1fa8c] border-[#f1fa8c]/30'
    : 'bg-[#ff5555]/15 text-[#ff5555] border-[#ff5555]/30'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold font-mono border ${color}`}
      data-testid="health-indicator-badge"
    >
      {healthScore}
    </span>
  )
}
