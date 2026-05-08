import { useState, useEffect, useRef } from 'react'
import { useProfile, useUpsertProfile } from '../data/profile'
import { parseCents, formatDollars, formatMoney } from '../lib/money'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { todayISO } from '../lib/cycle'

function NumberField({
  label,
  hint,
  value,
  onSave,
  prefix,
  suffix,
  min,
  max,
  step = '0.01',
  placeholder
}: {
  label: string
  hint?: string
  value: string
  onSave: (raw: string) => void
  prefix?: string
  suffix?: string
  min?: string
  max?: string
  step?: string
  placeholder?: string
}) {
  const [local, setLocal] = useState(value)
  const focusRef = useRef(false)

  useEffect(() => {
    if (!focusRef.current) setLocal(value)
  }, [value])

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text">{label}</p>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
      <div className="relative w-32 flex-shrink-0">
        {prefix && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">{prefix}</span>
        )}
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={local}
          onChange={e => setLocal(e.target.value)}
          onFocus={() => { focusRef.current = true }}
          onBlur={() => {
            focusRef.current = false
            if (local !== value) onSave(local)
          }}
          placeholder={placeholder ?? '0'}
          className={`field text-right tabular-nums text-sm ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-6' : ''}`}
        />
        {suffix && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">{suffix}</span>
        )}
      </div>
    </div>
  )
}

export function Settings() {
  const { session } = useAuth()
  const { data: profile } = useProfile()
  const upsert = useUpsertProfile()
  const [saved, setSaved] = useState<string | null>(null)

  const paycheck = profile ? formatDollars(profile.paycheck_cents) : '0.00'
  const needsPct  = String(profile?.needs_pct   ?? 50)
  const wantsPct  = String(profile?.wants_pct   ?? 30)
  const savingsPct = String(profile?.savings_pct ?? 20)
  const anchor = profile?.cycle_anchor_date ?? todayISO()

  const totalPct = (profile?.needs_pct ?? 50) + (profile?.wants_pct ?? 30) + (profile?.savings_pct ?? 20)

  async function save(updates: Parameters<typeof upsert.mutateAsync>[0], key: string) {
    await upsert.mutateAsync(updates)
    setSaved(key)
    setTimeout(() => setSaved(null), 1500)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="pb-24">
      <div className="px-4 pt-12 pb-4 border-b border-border">
        <h1 className="text-lg font-semibold text-text">Settings</h1>
      </div>

      {/* Paycheck */}
      <div className="px-4 pt-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted uppercase tracking-wider">Paycheck</p>
          {saved === 'paycheck' && <span className="text-xs text-success">Saved</span>}
        </div>
        <div className="card px-4 py-0">
          <NumberField
            label="Biweekly amount"
            hint={profile?.paycheck_cents ? `${formatMoney(Math.round(profile.paycheck_cents * 26 / 12))}/mo equivalent` : undefined}
            value={paycheck}
            prefix="$"
            placeholder="0.00"
            onSave={raw => save({ paycheck_cents: parseCents(raw) }, 'paycheck')}
          />
        </div>
      </div>

      {/* Budget allocations */}
      <div className="px-4 pt-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted uppercase tracking-wider">Budget allocation</p>
          <div className="flex items-center gap-2">
            {saved === 'buckets' && <span className="text-xs text-success">Saved</span>}
            <span className={`text-xs tabular-nums font-medium ${totalPct === 100 ? 'text-success' : 'text-danger'}`}>
              {totalPct}% of 100%
            </span>
          </div>
        </div>
        <div className="card px-4 py-0">
          <NumberField
            label="Needs"
            hint="Housing, food, essentials"
            value={needsPct}
            suffix="%"
            step="1"
            min="0"
            max="100"
            placeholder="50"
            onSave={raw => save({ needs_pct: Math.round(Number(raw) || 0) }, 'buckets')}
          />
          <NumberField
            label="Wants"
            hint="Entertainment, subscriptions"
            value={wantsPct}
            suffix="%"
            step="1"
            min="0"
            max="100"
            placeholder="30"
            onSave={raw => save({ wants_pct: Math.round(Number(raw) || 0) }, 'buckets')}
          />
          <NumberField
            label="Savings"
            hint="Savings & investments"
            value={savingsPct}
            suffix="%"
            step="1"
            min="0"
            max="100"
            placeholder="20"
            onSave={raw => save({ savings_pct: Math.round(Number(raw) || 0) }, 'buckets')}
          />
        </div>
      </div>

      {/* Cycle anchor */}
      <div className="px-4 pt-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted uppercase tracking-wider">Pay cycle</p>
          {saved === 'anchor' && <span className="text-xs text-success">Saved</span>}
        </div>
        <div className="card px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-text">Cycle start date</p>
            <p className="text-xs text-muted mt-0.5">The date your last pay period began</p>
          </div>
          <input
            type="date"
            defaultValue={anchor}
            onChange={e => {
              if (e.target.value) save({ cycle_anchor_date: e.target.value }, 'anchor')
            }}
            className="field w-auto text-sm"
          />
        </div>
      </div>

      {/* Account */}
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
