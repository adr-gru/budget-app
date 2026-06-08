import { formatMoney } from '../lib/money'

const BUCKET_META = [
  { key: 'needs'   as const, label: 'Needs',   hint: 'Housing, food, essentials',    color: '#3B82F6', placeholder: '50' },
  { key: 'wants'   as const, label: 'Wants',   hint: 'Entertainment, subscriptions', color: '#8B5CF6', placeholder: '30' },
  { key: 'savings' as const, label: 'Savings', hint: 'Savings & investments',        color: '#16A34A', placeholder: '20' },
]

interface Props {
  needs: string
  wants: string
  savings: string
  onNeedsChange: (v: string) => void
  onWantsChange: (v: string) => void
  onSavingsChange: (v: string) => void
  /** When provided, shows a formatted → $X.XX amount hint alongside the hint text */
  paycheckCents?: number
  /** When true, renders a colored dot before each label (used in onboarding) */
  showColors?: boolean
}

function bucketAmount(paycheckCents: number, pct: string): string {
  const cents = Math.round(paycheckCents * (Number(pct) || 0) / 100)
  return formatMoney(cents)
}

export function BudgetAllocationForm({
  needs, wants, savings,
  onNeedsChange, onWantsChange, onSavingsChange,
  paycheckCents, showColors = false,
}: Props) {
  const values   = { needs, wants, savings }
  const handlers = { needs: onNeedsChange, wants: onWantsChange, savings: onSavingsChange }

  return (
    <div className="card px-4 py-0">
      {BUCKET_META.map(({ key, label, hint, color, placeholder }) => (
        <div key={key} className="flex items-center gap-3 py-3.5 border-b border-border last:border-0">
          {showColors && (
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text">{label}</p>
            <p className="text-xs text-muted mt-0.5">
              {hint}
              {paycheckCents != null && paycheckCents > 0 && (
                <span style={{ color }} className="ml-1.5 font-mono tabular-nums">
                  → {bucketAmount(paycheckCents, values[key])}
                </span>
              )}
            </p>
          </div>
          <div className="relative w-24 flex-shrink-0">
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              max="100"
              value={values[key]}
              onChange={e => handlers[key](e.target.value)}
              placeholder={placeholder}
              className="field text-right font-mono tabular-nums text-sm pr-6"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">%</span>
          </div>
        </div>
      ))}
    </div>
  )
}
