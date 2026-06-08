import { useState, useEffect, useRef } from 'react'
import { useProfile, useUpsertProfile } from '../data/profile'
import { useAccounts } from '../data/accounts'
import { useSubscriptions } from '../data/subscriptions'
import { useGoals } from '../data/goals'
import { usePasskeyCredentials, useDeletePasskey } from '../data/passkeys'
import { useEmailDigestSettings, useUpsertEmailDigestSettings } from '../data/emailDigest'
import { parseCents, formatDollars, formatMoney } from '../lib/money'
import { useAuth } from '../auth/AuthProvider'
import { todayISO, currentCycleStart, cycleEnd, cycleLabel } from '../lib/cycle'
import { exportAccounts, exportSubscriptions, exportGoals, exportSnapshots, exportContributions } from '../lib/export'
import { isNative } from '../lib/native'
import { usePasskey, passkeySupported } from '../hooks/usePasskey'
import { format, parseISO, addDays } from 'date-fns'
import type { BalanceSnapshot, GoalContribution, EmailDigestSections } from '../lib/supabase'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { supabase } from '../lib/supabase'
import { NumberField } from '../components/NumberField'
import { BudgetAllocationForm } from '../components/BudgetAllocationForm'

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
      className="w-full flex items-center justify-between px-4 py-3.5 border-b border-border last:border-0 text-left hover:bg-elev/30 transition-colors"
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

function Toggle({
  checked, onChange
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
        checked ? 'bg-accent' : 'bg-muted/40'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
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

      const { supabase } = await import('../lib/supabase')
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('device_tokens').select('id').eq('user_id', user.id).limit(1)
        setPushEnabled((data ?? []).length > 0)
      }
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
    <div className="px-4 lg:px-6 pt-6">
      <p className="section-label mb-3">Native</p>
      <div className="card px-4 py-0">
        <div className="flex items-center justify-between py-3.5 border-b border-border">
          <div>
            <p className="text-sm text-text">Require Face ID to open</p>
            <p className="text-xs text-muted mt-0.5">Lock app when it enters background</p>
          </div>
          <Toggle checked={biometricEnabled} onChange={toggleBiometric} />
        </div>
        <div className="flex items-center justify-between py-3.5 border-b border-border">
          <div>
            <p className="text-sm text-text">Push notifications</p>
            <p className="text-xs text-muted mt-0.5">Subscription renewals &amp; card due dates</p>
          </div>
          <Toggle checked={pushEnabled} onChange={togglePush} />
        </div>
        <div className="py-3.5">
          <p className="text-xs text-muted">Passkeys are managed in the web version of the app.</p>
        </div>
      </div>
    </div>
  )
}

function WebSettings() {
  const { data: passkeys = [] } = usePasskeyCredentials()
  const deletePasskey = useDeletePasskey()
  const { register } = usePasskey()
  const [registering, setRegistering] = useState(false)
  const [regError, setRegError] = useState<string | null>(null)

  async function handleRegister() {
    setRegistering(true)
    setRegError(null)
    try {
      await register()
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string }
      if (e?.name !== 'NotAllowedError') setRegError(e?.message ?? 'Registration failed')
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="px-4 lg:px-6 pt-6">
      <p className="section-label mb-3">Passkeys</p>
      <div className="card px-4 py-0">
        {passkeys.map(p => (
          <div key={p.id} className="flex items-center justify-between py-3.5 border-b border-border">
            <div>
              <p className="text-sm text-text">{p.device_name ?? 'Passkey'}</p>
              <p className="text-xs text-muted mt-0.5">
                Added {format(parseISO(p.created_at), 'MMM d, yyyy')}
              </p>
            </div>
            <button
              onClick={() => deletePasskey.mutate(p.id)}
              disabled={deletePasskey.isPending}
              className="text-xs text-danger hover:text-danger/80 transition-colors"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          onClick={handleRegister}
          disabled={registering}
          className="w-full flex items-center justify-between py-3.5 text-left hover:bg-elev/30 transition-colors"
        >
          <div>
            <p className="text-sm text-text">
              {passkeys.length === 0 ? 'Add passkey for this browser' : 'Add another passkey'}
            </p>
            <p className="text-xs text-muted mt-0.5">Sign in with Face ID, Touch ID, or fingerprint</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted flex-shrink-0">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        {regError && (
          <p className="text-xs text-danger pb-3 -mt-1">{regError}</p>
        )}
      </div>
    </div>
  )
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function localHourToUtc(localH: number): number {
  const d = new Date()
  d.setHours(localH, 0, 0, 0)
  return d.getUTCHours()
}

function utcHourToLocal(utcH: number): number {
  const d   = new Date()
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), utcH)
  return new Date(utc).getHours()
}

function formatLocalHour(localH: number): string {
  const d = new Date()
  d.setHours(localH, 0, 0, 0)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const DEFAULT_SECTIONS: EmailDigestSections = {
  balances: true, subscriptions: true, budget: true, goals: true, credit_cards: true
}

function EmailDigestSection() {
  const { data: settings } = useEmailDigestSettings()
  const upsert = useUpsertEmailDigestSettings()
  const [saved,       setSaved]       = useState(false)
  const [enabled,     setEnabled]     = useState(false)
  const [frequency,   setFrequency]   = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [sendDay,     setSendDay]     = useState<number | null>(1)
  const [sendHour,    setSendHour]    = useState(8)
  const [recipients,  setRecipients]  = useState<string[]>([])
  const [detailLevel, setDetailLevel] = useState<'summary' | 'detailed'>('summary')
  const [sections,    setSections]    = useState<EmailDigestSections>(DEFAULT_SECTIONS)
  const [emailInput,  setEmailInput]  = useState('')
  const [emailError,  setEmailError]  = useState<string | null>(null)
  const [testSending, setTestSending] = useState(false)
  const [testStatus,  setTestStatus]  = useState<'sent' | 'error' | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!settings || initialized.current) return
    initialized.current = true
    setEnabled(settings.enabled)
    setFrequency(settings.frequency)
    setSendDay(settings.send_day)
    setSendHour(settings.send_hour)
    setRecipients(settings.recipients)
    setDetailLevel(settings.detail_level)
    setSections(settings.sections)
  }, [settings])

  async function persist(updates: Parameters<typeof upsert.mutateAsync>[0]) {
    await upsert.mutateAsync(updates)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function addRecipient() {
    const email = emailInput.trim().toLowerCase()
    if (!email) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Enter a valid email address')
      return
    }
    if (recipients.includes(email)) {
      setEmailError('Already added')
      return
    }
    const next = [...recipients, email]
    setRecipients(next)
    setEmailInput('')
    setEmailError(null)
    persist({ recipients: next })
  }

  function removeRecipient(email: string) {
    const next = recipients.filter(r => r !== email)
    setRecipients(next)
    persist({ recipients: next })
  }

  async function sendTestEmail() {
    setTestSending(true)
    setTestStatus(null)
    try {
      const { error } = await supabase.functions.invoke('email-digest', { body: { force: true } })
      setTestStatus(error ? 'error' : 'sent')
      if (error) console.error('Email digest test failed:', error)
    } catch (err) {
      setTestStatus('error')
      console.error('Email digest test exception:', err)
    } finally {
      setTestSending(false)
      setTimeout(() => setTestStatus(null), 4000)
    }
  }

  const hourOptions = Array.from({ length: 24 }, (_, i) => ({ localH: i, label: formatLocalHour(i) }))
  const currentLocalHour = utcHourToLocal(sendHour)

  const lastSentText = settings?.last_sent_at
    ? `Last sent ${format(parseISO(settings.last_sent_at), 'EEE MMM d, h:mm a')}`
    : null

  return (
    <div className="px-4 lg:px-6 pt-6">
      <div className="flex items-center justify-between mb-3">
        <p className="section-label">Email digest</p>
        {saved && <span className="text-xs text-success font-medium">Saved</span>}
      </div>
      <div className="card px-4 py-0">
        {/* Enable toggle */}
        <div className="flex items-center justify-between py-3.5 border-b border-border">
          <div>
            <p className="text-sm text-text">Email digest</p>
            <p className="text-xs text-muted mt-0.5">Receive a scheduled finance summary by email</p>
          </div>
          <Toggle
            checked={enabled}
            onChange={v => { setEnabled(v); persist({ enabled: v }) }}
          />
        </div>

        {enabled && (
          <>
            {/* Recipients */}
            <div className="py-3.5 border-b border-border">
              <p className="text-sm text-text mb-2">Recipients</p>
              {recipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {recipients.map(r => (
                    <span key={r} className="inline-flex items-center gap-1 bg-elev text-xs text-text px-2.5 py-1 rounded-md">
                      {r}
                      <button
                        onClick={() => removeRecipient(r)}
                        className="text-muted hover:text-danger transition-colors leading-none ml-0.5"
                        aria-label={`Remove ${r}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => { setEmailInput(e.target.value); setEmailError(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRecipient() } }}
                  placeholder="email@example.com"
                  className="field flex-1 text-sm"
                />
                <button
                  onClick={addRecipient}
                  className="btn-primary px-3 py-2 text-sm flex-shrink-0"
                >
                  Add
                </button>
              </div>
              {emailError && <p className="text-xs text-danger mt-1.5">{emailError}</p>}
            </div>

            {/* Frequency */}
            <div className="flex items-center justify-between py-3.5 border-b border-border">
              <p className="text-sm text-text">Frequency</p>
              <div className="flex rounded-md border border-border overflow-hidden">
                {(['daily', 'weekly', 'monthly'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => {
                      const newDay = f === 'daily' ? null : 1
                      setFrequency(f)
                      setSendDay(newDay)
                      persist({ frequency: f, send_day: newDay })
                    }}
                    className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                      frequency === f
                        ? 'bg-elev text-text font-medium'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Day picker */}
            {frequency !== 'daily' && (
              <div className="flex items-center justify-between py-3.5 border-b border-border">
                <p className="text-sm text-text">{frequency === 'weekly' ? 'Day of week' : 'Day of month'}</p>
                <select
                  value={sendDay ?? 1}
                  onChange={e => {
                    const day = Number(e.target.value)
                    setSendDay(day)
                    persist({ send_day: day })
                  }}
                  className="field text-sm w-auto"
                >
                  {frequency === 'weekly'
                    ? DAYS_OF_WEEK.map((d, i) => <option key={i} value={i}>{d}</option>)
                    : Array.from({ length: 31 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{i + 1}</option>
                      ))
                  }
                </select>
              </div>
            )}

            {/* Time */}
            <div className="flex items-center justify-between py-3.5 border-b border-border">
              <p className="text-sm text-text">Send time</p>
              <select
                value={currentLocalHour}
                onChange={e => {
                  const utcH = localHourToUtc(Number(e.target.value))
                  setSendHour(utcH)
                  persist({ send_hour: utcH })
                }}
                className="field text-sm w-auto"
              >
                {hourOptions.map(({ localH, label }) => (
                  <option key={localH} value={localH}>{label}</option>
                ))}
              </select>
            </div>

            {/* Detail level */}
            <div className="flex items-center justify-between py-3.5 border-b border-border">
              <p className="text-sm text-text">Detail level</p>
              <div className="flex rounded-md border border-border overflow-hidden">
                {(['summary', 'detailed'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => { setDetailLevel(d); persist({ detail_level: d }) }}
                    className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                      detailLevel === d
                        ? 'bg-elev text-text font-medium'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Sections — only when detailed */}
            {detailLevel === 'detailed' && (
              <div className="py-3.5 border-b border-border">
                <p className="text-sm text-text mb-2.5">Sections</p>
                {([
                  { key: 'balances'      as const, label: 'Account balances'       },
                  { key: 'subscriptions' as const, label: 'Upcoming subscriptions' },
                  { key: 'budget'        as const, label: 'Budget summary'         },
                  { key: 'goals'         as const, label: 'Goals progress'         },
                  { key: 'credit_cards'  as const, label: 'Credit card due dates'  },
                ]).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sections[key]}
                      onChange={e => {
                        const next = { ...sections, [key]: e.target.checked }
                        setSections(next)
                        persist({ sections: next })
                      }}
                      className="w-4 h-4 rounded accent-accent"
                    />
                    <span className="text-sm text-text">{label}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Test send */}
            <div className="py-3.5 flex items-center justify-between border-b border-border">
              <div>
                <p className="text-sm text-text">Test email</p>
                <p className="text-xs text-muted mt-0.5">Send a digest to all recipients now</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {testStatus === 'sent'  && <span className="text-xs text-success font-medium">Sent!</span>}
                {testStatus === 'error' && <span className="text-xs text-danger  font-medium">Failed</span>}
                <button
                  onClick={sendTestEmail}
                  disabled={testSending || recipients.length === 0}
                  className="btn text-xs disabled:opacity-50"
                >
                  {testSending ? 'Sending…' : 'Send test'}
                </button>
              </div>
            </div>

            {/* Last sent */}
            {lastSentText && (
              <div className="py-3">
                <p className="text-xs text-muted">{lastSentText}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function Settings() {
  const { session, signOut } = useAuth()
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: subs = [] } = useSubscriptions()
  const { data: goals = [] } = useGoals()
  const upsert = useUpsertProfile()
  const [saved, setSaved] = useState<string | null>(null)
  const [bucketError, setBucketError] = useState<string | null>(null)
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const [exportingSnapshots, setExportingSnapshots] = useState(false)

  const paycheck   = profile ? formatDollars(profile.paycheck_cents) : '0.00'
  const anchor     = profile?.cycle_anchor_date ?? todayISO()
  // Local state for bucket percentages — all three are validated together before saving
  const [localNeeds,   setLocalNeeds]   = useState(String(profile?.needs_pct   ?? 50))
  const [localWants,   setLocalWants]   = useState(String(profile?.wants_pct   ?? 30))
  const [localSavings, setLocalSavings] = useState(String(profile?.savings_pct ?? 20))

  // Keep local state in sync when profile loads or changes from elsewhere
  useEffect(() => {
    if (!profile) return
    setLocalNeeds(String(profile.needs_pct))
    setLocalWants(String(profile.wants_pct))
    setLocalSavings(String(profile.savings_pct))
  }, [profile?.needs_pct, profile?.wants_pct, profile?.savings_pct])

  const localTotal = (Number(localNeeds) || 0) + (Number(localWants) || 0) + (Number(localSavings) || 0)
  const bucketsDirty = localNeeds !== String(profile?.needs_pct ?? 50) ||
                       localWants !== String(profile?.wants_pct ?? 30) ||
                       localSavings !== String(profile?.savings_pct ?? 20)

  async function saveBuckets() {
    if (localTotal !== 100) {
      setBucketError(`Percentages must add up to 100% (currently ${localTotal}%)`)
      return
    }
    setBucketError(null)
    await save({
      needs_pct:   Math.round(Number(localNeeds)),
      wants_pct:   Math.round(Number(localWants)),
      savings_pct: Math.round(Number(localSavings)),
    }, 'buckets')
  }

  async function handleExportSnapshots() {
    setExportingSnapshots(true)
    try {
      const { data } = await supabase
        .from('account_balance_snapshots')
        .select('*')
        .order('recorded_at', { ascending: false })
      if (data) exportSnapshots(data as BalanceSnapshot[], accounts)
    } finally {
      setExportingSnapshots(false)
    }
  }

  const [anchorInput, setAnchorInput] = useState(anchor)
  useEffect(() => { setAnchorInput(anchor) }, [anchor])

  const cycleStart   = currentCycleStart(anchorInput)
  const cycleEndDate = cycleEnd(cycleStart)
  const nextStart    = addDays(cycleEndDate, 1)
  const cyclePreview = `Current cycle: ${cycleLabel(cycleStart)}  ·  Next: ${cycleLabel(nextStart)}`

  async function save(updates: Parameters<typeof upsert.mutateAsync>[0], key: string) {
    await upsert.mutateAsync(updates)
    setSaved(key)
    setTimeout(() => setSaved(null), 1500)
  }

  function handleTheme(t: Theme) {
    setTheme(t)
    setThemeState(t)
  }

  const themeOptions: { value: Theme; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light',  label: 'Light' },
    { value: 'dark',   label: 'Dark' },
  ]

  return (
    <div className="pb-24 lg:pb-8">
      <div className="px-4 lg:px-6 pt-6 lg:pt-8 pb-4 border-b border-border">
        <h1 className="page-title">Settings</h1>
      </div>

      {/* Paycheck */}
      <div className="px-4 lg:px-6 pt-6">
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">Paycheck</p>
          {saved === 'paycheck' && <span className="text-xs text-success font-medium">Saved</span>}
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
      <div className="px-4 lg:px-6 pt-6">
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">Budget allocation</p>
          <div className="flex items-center gap-2">
            {saved === 'buckets' && <span className="text-xs text-success font-medium">Saved</span>}
            <span className={`font-mono text-xs tabular-nums font-semibold ${localTotal === 100 ? 'text-success' : 'text-danger'}`}>
              {localTotal}% of 100%
            </span>
          </div>
        </div>
        <BudgetAllocationForm
          needs={localNeeds} wants={localWants} savings={localSavings}
          onNeedsChange={v => { setLocalNeeds(v); setBucketError(null) }}
          onWantsChange={v => { setLocalWants(v); setBucketError(null) }}
          onSavingsChange={v => { setLocalSavings(v); setBucketError(null) }}
        />
        {bucketError && <p className="text-xs text-danger mt-2 px-1">{bucketError}</p>}
        {bucketsDirty && (
          <button
            onClick={saveBuckets}
            disabled={upsert.isPending}
            className="btn-primary w-full py-2.5 mt-3 text-sm"
          >
            {upsert.isPending ? 'Saving…' : 'Save allocation'}
          </button>
        )}
      </div>

      {/* Pay cycle */}
      <div className="px-4 lg:px-6 pt-6">
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">Pay cycle</p>
          {saved === 'anchor' && <span className="text-xs text-success font-medium">Saved</span>}
        </div>
        <div className="card px-4 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text">Cycle start date</p>
              <p className="text-xs text-muted mt-0.5">The date your last pay period began</p>
            </div>
            <input
              type="date"
              defaultValue={anchor}
              onChange={e => {
                if (e.target.value) {
                  setAnchorInput(e.target.value)
                  save({ cycle_anchor_date: e.target.value }, 'anchor')
                }
              }}
              className="field w-auto text-sm flex-shrink-0"
            />
          </div>
          <p className="text-xs text-muted mt-2">{cyclePreview}</p>
        </div>
      </div>

      {/* Native toggles */}
      {isNative && <NativeSettings />}

      {/* Web passkeys */}
      {!isNative && passkeySupported && <WebSettings />}

      {/* Email digest */}
      <EmailDigestSection />

      {/* Appearance */}
      <div className="px-4 lg:px-6 pt-6">
        <p className="section-label mb-3">Appearance</p>
        <div className="card px-4 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-text">Theme</p>
            <div className="flex rounded-md border border-border overflow-hidden">
              {themeOptions.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleTheme(value)}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    theme === value
                      ? 'bg-elev border-accent text-text font-medium'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Data export */}
      <div className="px-4 lg:px-6 pt-6">
        <p className="section-label mb-3">Data</p>
        <div className="card overflow-hidden">
          {[
            { label: 'Export accounts',        hint: `${accounts.length} account${accounts.length !== 1 ? 's' : ''}`,           onClick: () => exportAccounts(accounts),     loading: false },
            { label: 'Export subscriptions',   hint: `${subs.length} subscription${subs.length !== 1 ? 's' : ''}`,             onClick: () => exportSubscriptions(subs),    loading: false },
            { label: 'Export balance history', hint: 'All historical snapshots',                                                 onClick: handleExportSnapshots,              loading: exportingSnapshots },
            { label: 'Export goals',           hint: `${goals.length} goal${goals.length !== 1 ? 's' : ''}`,                   onClick: () => exportGoals(goals),           loading: false }
          ].map(({ label, hint, onClick, loading }) => (
            <button
              key={label}
              onClick={onClick}
              disabled={loading}
              className="w-full flex items-center justify-between px-4 py-3.5 border-b border-border last:border-0 text-left hover:bg-elev/30 transition-colors disabled:opacity-60"
            >
              <div>
                <p className="text-sm text-text">{label}</p>
                <p className="text-xs text-muted mt-0.5">{hint}</p>
              </div>
              {loading ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted animate-spin flex-shrink-0">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted flex-shrink-0">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              )}
            </button>
          ))}
          <AllContributionsExport goals={goals as any} />
        </div>
      </div>

      {/* Account */}
      <div className="px-4 lg:px-6 pt-6 pb-2">
        <p className="section-label mb-3">Account</p>
        <div className="card px-4 py-3.5 flex items-center justify-between mb-3">
          <span className="text-sm text-subtle truncate">{session?.user.email}</span>
        </div>
        <button
          onClick={signOut}
          className="w-full btn text-danger hover:text-danger border-danger/25 hover:bg-danger/5"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
