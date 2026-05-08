import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CategoryCard } from '../components/CategoryCard'
import { useTransactions } from '../data/transactions'
import { useTargets } from '../data/targets'
import { CATEGORIES } from '../lib/categories'
import { formatMoney } from '../lib/money'
import { thisWeekStart, weekLabel } from '../lib/week'
import type { Category } from '../lib/supabase'

export function Dashboard() {
  const [ws] = useState(() => thisWeekStart())
  const navigate = useNavigate()
  const { data: transactions = [], isLoading } = useTransactions(ws)
  const { data: targets = [] } = useTargets()

  const spent = CATEGORIES.reduce<Record<Category, number>>((acc, cat) => {
    acc[cat] = transactions
      .filter(t => t.category === cat)
      .reduce((sum, t) => sum + t.amount_cents, 0)
    return acc
  }, {} as Record<Category, number>)

  const targetMap = targets.reduce<Record<Category, number>>((acc, t) => {
    acc[t.category] = t.target_cents
    return acc
  }, {} as Record<Category, number>)

  const totalSpent = Object.values(spent).reduce((s, v) => s + v, 0)
  const totalTarget = Object.values(targetMap).reduce((s, v) => s + v, 0)

  return (
    <div className="pb-24">
      <div className="px-4 pt-12 pb-4 border-b border-border">
        <p className="text-xs text-muted mb-1">{weekLabel(ws)}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-text tabular-nums">{formatMoney(totalSpent)}</span>
          {totalTarget > 0 && (
            <span className="text-sm text-muted">of {formatMoney(totalTarget)}</span>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-2">
        {isLoading ? (
          <div className="py-12 text-center text-muted text-sm">Loading…</div>
        ) : (
          <>
            {transactions.length === 0 && (
              <p className="py-3 text-center text-muted text-sm">
                No transactions yet — tap a category to add one.
              </p>
            )}
            {CATEGORIES.map(cat => (
              <CategoryCard
                key={cat}
                category={cat}
                spentCents={spent[cat] ?? 0}
                targetCents={targetMap[cat] ?? 0}
                onClick={() => navigate(`/add?category=${cat}`)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
