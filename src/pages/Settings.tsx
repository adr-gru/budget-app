import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile, useUpsertProfile } from '../data/profile'
import { useAccounts } from '../data/accounts'
import { useSubscriptions } from '../data/subscriptions'
import { useGoals } from '../data/goals'
import { useLatestBalances } from '../data/snapshots'
import { parseCents, formatDollars, formatMoney } from '../lib/money'
import { useAuth } from '../auth/AuthProvider'
import { todayISO } from '../lib/cycle'
import { exportAccounts, exportSubscriptions, exportGoals, exportSnapshots, exportContributions } from '../lib/export'
import { isNative } from '../lib/native'
import type { GoalContribution } from '../lib/supabase'

function NumberField({
  label, hint, value, onSave, prefix, suffix,
  min, max, step = '0.01', placeholder
}: {
  label: string; hint?: string; value: string
  onSave: (raw: string) => void
  prefix?: string; suffix?: string
  min?: string; max?: string; step?: string; placeholder?: string
}) {
  const [local, setLocal] = useState(value)
  const focusRef = useRef(false)

  useEffect(() => { if (!focusRef.current) setLocal(value) }, [value])

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text">{label}</p>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
      <div className="relative w-32 flex-shrink-0">
        {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={local}
          onChange={e => setLocal(e.target.value)}
          onFocus={() => { focusRef.current = true }}
          onBlur={() => { focusRef.current = false; if (local !== value) onSave(local) }}
          placeholder={placeholder ?? '0'}
          className={`field text-right tabular-nums text-sm ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-6' : ''}`}
        />
        {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">{suffix}</span>}
      </div>
    </div>
  )
}

function AllContributionsExport({ goals }: { goals: ReturnType<typeof useGoals>['data'] & object[] }) {
  const typedGoals = (goals ?? []) as import('../lib/supabase').Goal[]
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    try {
      const { supabase: sb } = await import('../lib/supabase')
      const { data } = await sb.from('goal_contributions').select('*').order('occurred_on', { ascending: false })
      if (data) exportContributions(data as GoalContribution[], typedGoals)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="w-full flex items-center justify-between px-4 py-3 border-b border-border last:border-0 text-left"
    >
      <div>
        <p className="text-sm text-text">Export contributions</p>
        <p className="text-xs text-muted mt-0.5">All goal contribution history</p>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted flex-shrink-0">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    </button>
  )
}

function NativeSettings() {
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)

  useEffect(() => {
    async function load() {
      const { Preferences } = await import('@capacitor/preferences')
      const { value } = await Preferences.get({ key: 'biometric_enabled' })
      setBiometricEnabled(value === 'true')
    }
    load()
  }, [])

  async function toggleBiometric(enabled: boolean) {
    const { Preferences } = await import('@capacitor/preferences')
    await Preferences.set({ key: 'biometric_enabled', value: String(enabled) })
    setBiometricEnabled(enabled)
  }

  async function togglePush(enabled: boolean) {
    if (enabled) {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const perm = await PushNotifications.requestPermissions()
      if (perm.receive === 'granted') {
        await PushNotifications.register()
        setPushEnabled(true)
      }
    } else {
      const { supabase } = await import('../lib/supabase')
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('device_tokens').delete().eq('user_id', user.id)
      }
      setPushEnabled(false)
    }
  }

  return (
    <div className="px-4 pt-5">
      <p className="text-xs text-muted mb-3 uppercase tracking-wider">Native</p>
      <div className="card px-4 py-0">
        <div className="flex items-center justify-between py-3 border-b border-border">
          <div>
            <p className="text-sm text-text">Require Face ID to open</p>
            <p className="text-xs text-muted mt-0.5">Lock app when it enters background</p>
          </div>
          <button
            role="switch"
            aria-checked={biometricEnabled}
            onClick={() => toggleBiometric(!biometricEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${biometricEnabled ? 'bg-accent' : 'bg-border'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${biometricEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm text-text">Push notifications</p>
            <p className="text-xs text-muted mt-0.5">Subscription renewals &amp; card due dates</p>
          </div>
          <button
            role="switch"
            aria-checked={pushEnabled}
            onClick={() => togglePush(!pushEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${pushEnabled ? 'bg-accent' : 'bg-border'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${pushEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function Settings() {
  const navigate = useNavigate()
  const { session, signOut } = useAuth()
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: subs = [] } = useSubscriptions()
  const { data: goals = [] } = useGoals()
  const { data: snapshots = [] } = useLatestBalances()
  const upsert = useUpsertProfile()
  const [saved, setSaved] = useState<string | null>(null)

  const paycheck  = profile ? formatDollars(profile.paycheck_cents) : '0.00'
  const needsPct  = String(profile?.needs_pct   ?? 50)
  const wantsPct  = String(profile?.wants_pct   ?? 30)
  const savingsPct = String(profile?.savings_pct ?? 20)
  const anchor    = profile?.cycle_anchor_date ?? todayISO()
  const totalPct  = (profile?.needs_pct ?? 50) + (profile?.wants_pct ?? 30) + (profile?.savings_pct ?? 20)

  async function save(updates: Parameters<typeof upsert.mutateAsync>[0], key: string) {
    await upsert.mutateAsync(updates)
    setSaved(key)
    setTimeout(() => setSaved(null), 1500)
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
          <NumberField label="Needs"   hint="Housing, food, essentials"         value={needsPct}   suffix="%" step="1" min="0" max="100" placeholder="50" onSave={raw => save({ needs_pct:   Math.round(Number(raw) || 0) }, 'buckets')} />
          <NumberField label="Wants"   hint="Entertainment, subscriptions"       value={wantsPct}   suffix="%" step="1" min="0" max="100" placeholder="30" onSave={raw => save({ wants_pct:   Math.round(Number(raw) || 0) }, 'buckets')} />
          <NumberField label="Savings" hint="Savings &amp; investments"          value={savingsPct} suffix="%" step="1" min="0" max="100" placeholder="20" onSave={raw => save({ savings_pct: Math.round(Number(raw) || 0) }, 'buckets')} />
        </div>
      </div>

      {/* Pay cycle */}
      <div className="px-4 pt-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted uppercase tracking-wider">Pay cycle</p>
          {saved === 'anchor' && <span className="text-xs text-success">Saved</span>}
        </div>
        <div className="card px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text">Cycle start date</p>
            <p className="text-xs text-muted mt-0.5">The date your last pay period began</p>
          </div>
          <input
            type="date"
            defaultValue={anchor}
            onChange={e => { if (e.target.value) save({ cycle_anchor_date: e.target.value }, 'anchor') }}
            className="field w-auto text-sm flex-shrink-0"
          />
        </div>
      </div>

      {/* Goals link */}
      <div className="px-4 pt-5">
        <p className="text-xs text-muted mb-3 uppercase tracking-wider">Planning</p>
        <button
          onClick={() => navigate('/goals')}
          className="w-full card px-4 py-3 flex items-center justify-between"
        >
          <div>
            <p className="text-sm text-text">Savings goals</p>
            <p className="text-xs text-muted mt-0.5">{goals.length} goal{goals.length !== 1 ? 's' : ''} active</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted flex-shrink-0">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      {/* Native toggles — only rendered on iOS/Android */}
      {isNative && <NativeSettings />}

      {/* Data export */}
      <div className="px-4 pt-5">
        <p className="text-xs text-muted mb-3 uppercase tracking-wider">Data</p>
        <div className="card overflow-hidden">
          {[
            { label: 'Export accounts', hint: `${accounts.length} account${accounts.length !== 1 ? 's' : ''}`, onClick: () => exportAccounts(accounts) },
            { label: 'Export subscriptions', hint: `${subs.length} subscription${subs.length !== 1 ? 's' : ''}`, onClick: () => exportSubscriptions(subs) },
            { label: 'Export balance history', hint: `${snapshots.length} snapshot${snapshots.length !== 1 ? 's' : ''}`, onClick: () => exportSnapshots(snapshots as any[], accounts) },
            { label: 'Export goals', hint: `${goals.length} goal${goals.length !== 1 ? 's' : ''}`, onClick: () => exportGoals(goals) }
          ].map(({ label, hint, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="w-full flex items-center justify-between px-4 py-3 border-b border-border last:border-0 text-left"
            >
              <div>
                <p className="text-sm text-text">{label}</p>
                <p className="text-xs text-muted mt-0.5">{hint}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted flex-shrink-0">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
          ))}
          <AllContributionsExport goals={goals as any} />
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
