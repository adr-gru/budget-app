import { useState, useEffect, useRef } from 'react'
import { useTargets, useUpsertTarget } from '../data/targets'
import { CATEGORIES, CATEGORY_META } from '../lib/categories'
import { parseCents, formatDollars } from '../lib/money'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { Category } from '../lib/supabase'

function TargetRow({ category, currentCents }: { category: Category; currentCents: number }) {
  const meta = CATEGORY_META[category]
  const upsert = useUpsertTarget()
  const [value, setValue] = useState(currentCents > 0 ? formatDollars(currentCents) : '')
  const [saved, setSaved] = useState(false)
  const hasFocus = useRef(false)

  // Only sync from props when the input isn't focused — prevents a background
  // refetch from resetting what the user is actively typing.
  useEffect(() => {
    if (!hasFocus.current) {
      setValue(currentCents > 0 ? formatDollars(currentCents) : '')
    }
  }, [currentCents])

  async function save() {
    const cents = parseCents(value)
    await upsert.mutateAsync({ category, target_cents: cents })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function handleFocus() {
    hasFocus.current = true
  }

  function handleBlur() {
    hasFocus.current = false
    const cents = parseCents(value)
    if (cents !== currentCents) save()
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <span className="text-base flex-shrink-0" style={{ color: meta.color }}>{meta.icon}</span>
      <span className="text-sm text-text flex-1">{meta.label}</span>
      <div className="relative w-28">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">$</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={value}
          onChange={e => setValue(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="0.00"
          className="field pl-6 text-sm text-right tabular-nums"
        />
      </div>
      {saved && <span className="text-xs text-success flex-shrink-0">Saved</span>}
    </div>
  )
}

export function Settings() {
  const { session } = useAuth()
  const { data: targets = [] } = useTargets()

  const targetMap = targets.reduce<Record<Category, number>>((acc, t) => {
    acc[t.category] = t.target_cents
    return acc
  }, {} as Record<Category, number>)

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="pb-24">
      <div className="px-4 pt-12 pb-4 border-b border-border">
        <h1 className="text-lg font-semibold text-text">Settings</h1>
      </div>

      <div className="px-4 pt-5">
        <p className="text-xs text-muted mb-3 uppercase tracking-wider">Weekly targets</p>
        <div className="card px-4 py-0">
          {CATEGORIES.map(cat => (
            <TargetRow key={cat} category={cat} currentCents={targetMap[cat] ?? 0} />
          ))}
        </div>
      </div>

      <div className="px-4 pt-6">
        <p className="text-xs text-muted mb-3 uppercase tracking-wider">Account</p>
        <div className="card px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-subtle truncate">{session?.user.email}</span>
        </div>
        <button
          onClick={signOut}
          className="mt-3 w-full btn text-danger hover:text-danger border-border"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
