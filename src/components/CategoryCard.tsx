import { CATEGORY_META } from '../lib/categories'
import { formatMoney } from '../lib/money'
import type { Category } from '../lib/supabase'

interface Props {
  category: Category
  spentCents: number
  targetCents: number
  onClick?: () => void
}

export function CategoryCard({ category, spentCents, targetCents, onClick }: Props) {
  const meta = CATEGORY_META[category]
  const pct = targetCents > 0 ? Math.min((spentCents / targetCents) * 100, 100) : 0
  const over = targetCents > 0 && spentCents > targetCents
  const noTarget = targetCents === 0

  return (
    <button
      onClick={onClick}
      className="card p-4 w-full text-left hover:border-border/80 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none" style={{ color: meta.color }}>{meta.icon}</span>
          <span className="text-sm font-medium text-text">{meta.label}</span>
        </div>
        <div className="text-right">
          <span className={`text-sm font-medium tabular-nums ${over ? 'text-danger' : 'text-text'}`}>
            {formatMoney(spentCents)}
          </span>
          {!noTarget && (
            <span className="text-xs text-muted ml-1">/ {formatMoney(targetCents)}</span>
          )}
        </div>
      </div>

      {!noTarget && (
        <div className="h-1 bg-elev rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${over ? 'bg-danger' : 'bg-accent'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {over && (
        <p className="mt-2 text-xs text-danger">
          +{formatMoney(spentCents - targetCents)} over budget
        </p>
      )}

      {noTarget && (
        <p className="text-xs text-muted">No target set</p>
      )}
    </button>
  )
}
