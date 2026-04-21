import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from './ui/select'

interface ModelOption {
  alias: string
  label: string
  fullId: string
  tier: string
  tierColor: 'neutral' | 'accent' | 'green'
}

export const MODEL_OPTIONS: ModelOption[] = [
  { alias: 'sonnet', label: 'Sonnet', fullId: 'claude-sonnet-4-6',          tier: 'Balanced',     tierColor: 'neutral' },
  { alias: 'opus',   label: 'Opus',   fullId: 'claude-opus-4-7',            tier: 'Most capable', tierColor: 'accent'  },
  { alias: 'haiku',  label: 'Haiku',  fullId: 'claude-haiku-4-5-20251001',  tier: 'Fastest',      tierColor: 'green'   },
]

function tierBadgeClass(color: ModelOption['tierColor']): string {
  switch (color) {
    case 'neutral': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    case 'accent':  return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
    case 'green':   return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  }
}

interface ModelComboboxProps {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}

export function ModelCombobox({ value, onChange, disabled }: ModelComboboxProps) {
  const selected = MODEL_OPTIONS.find(o => o.alias === value) ?? MODEL_OPTIONS[0]

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      {/* Compact single-line trigger */}
      <SelectTrigger className="w-[168px] h-7 text-xs gap-1.5 px-2.5">
        <span className="font-medium text-foreground">{selected.label}</span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tierBadgeClass(selected.tierColor)}`}>
          {selected.tier}
        </span>
      </SelectTrigger>
      {/* Rich dropdown items */}
      <SelectContent>
        {MODEL_OPTIONS.map((opt) => (
          <SelectItem key={opt.alias} value={opt.alias} className="py-2 pr-6">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{opt.label}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tierBadgeClass(opt.tierColor)}`}>
                  {opt.tier}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">{opt.fullId}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
