import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { useThemeOptional } from '../../context/ThemeContext'
import { THEME_IDS, THEMES, type ThemeId } from '../../lib/themes'

/**
 * Hub-wide theme picker. Three cards, one per built-in theme. Click to
 * apply optimistically and persist to the server. Failure reverts to the
 * previously active theme. No live preview on hover (intentional v1
 * decision — see openspec/changes/add-hub-theme-system/design.md D7).
 */
export function AppearanceSection() {
  const ctx = useThemeOptional()
  // No provider mounted — graceful no-op (only happens in unit tests that
  // exercise GlobalSettingsPage in isolation without ThemeProvider).
  if (!ctx) return null
  const { themeId, setTheme, isUpdating } = ctx

  async function handleSelect(id: ThemeId): Promise<void> {
    if (id === themeId) return
    try {
      await setTheme(id)
    } catch (err) {
      toast.error('Failed to update theme', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Appearance
      </h3>
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-2"
        role="radiogroup"
        aria-label="Theme"
      >
        {THEME_IDS.map((id) => {
          const t = THEMES[id]
          const selected = id === themeId
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={isUpdating}
              onClick={() => void handleSelect(id)}
              className={
                'group relative overflow-hidden rounded-lg border text-left transition-all ' +
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 ' +
                'disabled:opacity-60 disabled:cursor-not-allowed ' +
                (selected
                  ? 'border-accent-primary ring-1 ring-accent-primary shadow-[0_0_0_1px_var(--color-accent-primary)] '
                  : 'border-border hover:border-accent-primary/40 hover:shadow-md ')
              }
              data-testid={`theme-card-${id}`}
              data-selected={selected ? 'true' : 'false'}
            >
              {/* Preview swatch */}
              <div
                className="h-20 w-full flex items-end gap-1 p-2"
                style={{
                  background:
                    `linear-gradient(135deg, ${t.previewSwatches.background} 0%, ${t.previewSwatches.background} 60%, color-mix(in srgb, ${t.previewSwatches.accents[0]} 18%, ${t.previewSwatches.background}) 100%)`,
                }}
                aria-hidden="true"
              >
                {t.previewSwatches.accents.map((c, i) => (
                  <span
                    key={i}
                    className="h-3 w-3 rounded-full ring-1 ring-black/10"
                    style={{ background: c }}
                  />
                ))}
              </div>
              {/* Body */}
              <div className="p-3 space-y-1 bg-card">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{t.displayName}</p>
                  {selected && (
                    <Check
                      className="w-3.5 h-3.5 text-accent-primary shrink-0"
                      aria-label="Currently active"
                    />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {t.tagline}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
