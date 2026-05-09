import { useState, useEffect } from 'react'
import { useAccounts, useAddAccount, useUpdateAccount, useDeleteAccount } from '../data/accounts'
import {
  useTellerEnroll,
  useTellerSync,
  useLinkAccountToTeller,
  useLoadTellerConnect
} from '../data/teller'
import { useLatestBalances, useCycleActivitySnapshots, computeActivity } from '../data/snapshots'
import { useProfile } from '../data/profile'
import { AccountCard } from '../components/AccountCard'
import { Sheet } from '../components/Sheet'
import { currentCycleStart, todayISO } from '../lib/cycle'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney, parseCents } from '../lib/money'
import type { Account, AccountType } from '../lib/supabase'
import type { TellerConnectAccount } from '../lib/teller.d'

function mapTellerType(type: string, subtype: string): AccountType {
  if (type === 'credit') return 'credit_card'
  if (subtype === 'savings') return 'savings'
  const investSubtypes = ['brokerage', 'ira', 'k401', 'k401a', 'k403b', 'k457']
  if (type === 'investment' || investSubtypes.includes(subtype)) return 'investment'
  return 'checking'
}

export function Accounts() {
  const { data: accounts = [] }        = useAccounts()
  const { data: latestBalances = [] }  = useLatestBalances()
  const { data: profile }              = useProfile()
  const tellerSync                     = useTellerSync()

  const anchor     = profile?.cycle_anchor_date ?? todayISO()
  const cycleStart = currentCycleStart(anchor)
  const { data: activitySnapshots = [] } = useCycleActivitySnapshots(cycleStart)

  const balanceMap     = new Map(latestBalances.map(s => [s.account_id, s.balance_cents]))
  const lastUpdatedMap = new Map(latestBalances.map(s => [s.account_id, s.recorded_at]))
  const activityMap    = computeActivity(activitySnapshots, cycleStart)

  const [editTarget,    setEditTarget]    = useState<Account | null>(null)
  const [connectTarget, setConnectTarget] = useState<Account | null>(null)
  const [showAdd,       setShowAdd]       = useState(false)

  const hasLinked = accounts.some(a => a.teller_enrollment_id)

  const accountsByType = ACCOUNT_TYPES.reduce((acc, type) => {
    acc[type] = accounts.filter(a => a.type === type)
    return acc
  }, {} as Record<AccountType, Account[]>)

  return (
    <div className="pb-24">
      <div className="px-4 pt-12 pb-4 border-b border-border flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">Accounts</h1>
        <div className="flex items-center gap-2">
          {hasLinked && (
            <button
              onClick={() => tellerSync.mutate()}
              disabled={tellerSync.isPending}
              className="btn-ghost text-xs gap-1.5 py-1.5"
              aria-label="Sync balances"
            >
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={tellerSync.isPending ? 'animate-spin' : ''}
              >
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {tellerSync.isPending ? 'Syncing…' : 'Sync'}
            </button>
          )}
          <button onClick={() => setShowAdd(true)} className="btn text-sm gap-1.5">
            <span className="text-base leading-none">+</span> Add
          </button>
        </div>
      </div>

      {accounts.length === 0 && (
        <div className="px-4 pt-5">
          <div className="card px-4 py-5 text-center">
            <p className="text-sm text-subtle mb-1">No accounts yet.</p>
            <p className="text-xs text-muted">Link your bank accounts via Teller to start syncing balances automatically.</p>
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 px-5 py-2 text-sm">
              Connect first account
            </button>
          </div>
        </div>
      )}

      {ACCOUNT_TYPES.map(type => {
        const list = accountsByType[type]
        if (list.length === 0) return null
        const meta  = ACCOUNT_TYPE_META[type]
        const total = list.reduce((sum, a) => sum + (balanceMap.get(a.id) ?? 0), 0)

        return (
          <div key={type} className="px-4 pt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted uppercase tracking-wider">{meta.label}</p>
              <p className="text-xs tabular-nums font-medium" style={{ color: meta.color }}>
                {formatMoney(total)}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              {list.map(a => (
                <AccountCard
                  key={a.id}
                  account={a}
                  balance={balanceMap.get(a.id) ?? null}
                  delta={activityMap.get(a.id)?.delta ?? null}
                  lastSnapshotAt={lastUpdatedMap.get(a.id) ?? null}
                  onTap={() => setEditTarget(a)}
                  onEdit={() => setEditTarget(a)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {editTarget && (
        <EditAccountSheet
          account={editTarget}
          onConnectBank={() => { setEditTarget(null); setConnectTarget(editTarget) }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {connectTarget && (
        <ConnectBankSheet
          account={connectTarget}
          onClose={() => setConnectTarget(null)}
        />
      )}

      {showAdd && <AddViaBankSheet onClose={() => setShowAdd(false)} />}
    </div>
  )
}

// ─── Add via Bank Sheet ───────────────────────────────────────────────────────

interface AccountConfig {
  checked:    boolean
  nickname:   string
  limitValue: string
  dueDay:     string
}

function AddViaBankSheet({ onClose }: { onClose: () => void }) {
  const [scriptReady,     setScriptReady]     = useState(false)
  const [scriptError,     setScriptError]     = useState(false)
  const [tellerAccts,     setTellerAccts]     = useState<TellerConnectAccount[] | null>(null)
  const [accessToken,     setAccessToken]     = useState<string | null>(null)
  const [institutionName, setInstitutionName] = useState<string | null>(null)
  const [config,          setConfig]          = useState<Record<string, AccountConfig>>({})
  const [submitting,      setSubmitting]      = useState(false)

  const enroll      = useTellerEnroll()
  const addAccount  = useAddAccount()
  const linkAccount = useLinkAccountToTeller()
  const tellerSync  = useTellerSync()
  const loadScript  = useLoadTellerConnect()

  useEffect(() => {
    loadScript()
      .then(() => setScriptReady(true))
      .catch(() => setScriptError(true))
  }, [loadScript])

  function openTeller() {
    if (!window.TellerConnect) return
    const appId = import.meta.env.VITE_TELLER_APP_ID as string
    const tc = window.TellerConnect.setup({
      applicationId: appId,
      environment:   'production',
      products:      ['transactions', 'balance'],
      onSuccess: (enrollment) => {
        const inst = enrollment.accounts[0]?.institution?.name ?? null
        setAccessToken(enrollment.accessToken)
        setInstitutionName(inst)
        setTellerAccts(enrollment.accounts)
        const defaults: Record<string, AccountConfig> = {}
        for (const a of enrollment.accounts) {
          defaults[a.id] = { checked: true, nickname: a.name, limitValue: '', dueDay: '' }
        }
        setConfig(defaults)
      },
      onExit: () => {}
    })
    tc.open()
  }

  function updateConfig(id: string, patch: Partial<AccountConfig>) {
    setConfig(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const selectedCount = tellerAccts
    ? tellerAccts.filter(a => config[a.id]?.checked).length
    : 0

  async function confirmImport() {
    if (!tellerAccts || !accessToken) return
    setSubmitting(true)
    try {
      const enrollResult = await enroll.mutateAsync({
        access_token: accessToken,
        institution_name: institutionName
      })
      for (const ta of tellerAccts) {
        const cfg = config[ta.id]
        if (!cfg?.checked) continue
        const type    = mapTellerType(ta.type, ta.subtype)
        const newAcct = await addAccount.mutateAsync({
          name:               cfg.nickname.trim() || ta.name,
          type,
          credit_limit_cents: type === 'credit_card' && cfg.limitValue ? parseCents(cfg.limitValue) : null,
          due_day:            type === 'credit_card' && cfg.dueDay ? Number(cfg.dueDay) : null,
        })
        await linkAccount.mutateAsync({
          account_id:              newAcct.id,
          teller_account_id:       ta.id,
          teller_enrollment_db_id: enrollResult.enrollment_db_id,
          institution_name:        institutionName
        })
      }
      await tellerSync.mutateAsync()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  // Step 2 — configure accounts
  if (tellerAccts) {
    return (
      <Sheet onClose={onClose} title="Import accounts" maxHeight="90vh">
        <div className="px-4 pb-4">
          {institutionName && (
            <p className="text-xs text-muted mb-4">
              Found {tellerAccts.length} account{tellerAccts.length !== 1 ? 's' : ''} at {institutionName}
            </p>
          )}
          <div className="flex flex-col gap-3 mb-5">
            {tellerAccts.map(ta => {
              const cfg  = config[ta.id] ?? { checked: true, nickname: ta.name, limitValue: '', dueDay: '' }
              const type = mapTellerType(ta.type, ta.subtype)
              return (
                <div
                  key={ta.id}
                  className={`card px-4 py-3 transition-opacity ${cfg.checked ? '' : 'opacity-50'}`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <button
                      type="button"
                      onClick={() => updateConfig(ta.id, { checked: !cfg.checked })}
                      className={`w-5 h-5 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border-2 transition-colors ${
                        cfg.checked ? 'bg-accent border-accent' : 'border-border'
                      }`}
                    >
                      {cfg.checked && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted capitalize">
                        {ta.subtype.replace(/_/g, ' ')}{ta.last_four ? ` ····${ta.last_four}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] font-medium" style={{ color: ACCOUNT_TYPE_META[type].color }}>
                      {ACCOUNT_TYPE_META[type].label}
                    </span>
                  </div>

                  {cfg.checked && (
                    <div className="flex flex-col gap-2 pl-8">
                      <div>
                        <label className="text-[10px] text-muted block mb-1">Nickname</label>
                        <input
                          type="text"
                          value={cfg.nickname}
                          onChange={e => updateConfig(ta.id, { nickname: e.target.value })}
                          className="field text-sm py-2"
                          placeholder={ta.name}
                        />
                      </div>
                      {type === 'credit_card' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Credit limit</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">$</span>
                              <input
                                type="number" inputMode="decimal" step="0.01" min="0"
                                value={cfg.limitValue}
                                onChange={e => updateConfig(ta.id, { limitValue: e.target.value })}
                                placeholder="0.00" className="field text-sm py-2 pl-6"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Due day</label>
                            <input
                              type="number" inputMode="numeric" min="1" max="31"
                              value={cfg.dueDay}
                              onChange={e => updateConfig(ta.id, { dueDay: e.target.value })}
                              placeholder="e.g. 15" className="field text-sm py-2"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <button
            onClick={confirmImport}
            disabled={selectedCount === 0 || submitting}
            className="btn-primary w-full py-3"
          >
            {submitting
              ? 'Importing…'
              : selectedCount === 0
              ? 'Select at least one account'
              : `Import ${selectedCount} account${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </Sheet>
    )
  }

  // Step 1 — connect
  return (
    <Sheet onClose={onClose} title="Add account" maxHeight="55vh">
      <div className="px-4 pb-4">
        <p className="text-sm text-subtle mb-5">
          Accounts sync directly from your bank via Teller. Your credentials are never stored here — they go directly to your bank.
        </p>
        {scriptError ? (
          <p className="text-sm text-danger">Could not load Teller Connect. Check your internet connection and try again.</p>
        ) : (
          <button
            onClick={openTeller}
            disabled={!scriptReady}
            className="btn-primary w-full py-3"
          >
            {scriptReady ? 'Connect with Teller' : 'Loading…'}
          </button>
        )}
      </div>
    </Sheet>
  )
}

// ─── Edit Account Sheet ───────────────────────────────────────────────────────

function EditAccountSheet({
  account,
  onConnectBank,
  onClose
}: {
  account: Account
  onConnectBank: () => void
  onClose: () => void
}) {
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()
  const meta          = ACCOUNT_TYPE_META[account.type]

  const [name,       setName]       = useState(account.name)
  const [limitValue, setLimitValue] = useState(
    account.credit_limit_cents ? String(account.credit_limit_cents / 100) : ''
  )
  const [dueDay,   setDueDay]   = useState(account.due_day ? String(account.due_day) : '')
  const [deleting, setDeleting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await updateAccount.mutateAsync({
      id:                 account.id,
      name:               name.trim(),
      credit_limit_cents: account.type === 'credit_card' && limitValue ? parseCents(limitValue) : account.credit_limit_cents,
      due_day:            account.type === 'credit_card' && dueDay ? Number(dueDay) : account.due_day
    })
    onClose()
  }

  async function handleDelete() {
    const msg = account.teller_enrollment_id
      ? `Delete "${account.name}"? This will disconnect its bank link and remove all balance history. Cannot be undone.`
      : `Delete "${account.name}"? All balance history will be removed. Cannot be undone.`
    if (!confirm(msg)) return
    setDeleting(true)
    await deleteAccount.mutateAsync(account.id)
    onClose()
  }

  return (
    <Sheet onClose={onClose} title="Edit account" maxHeight="90vh">
      <form onSubmit={submit} className="px-4 flex flex-col gap-4 pb-2">
        <div>
          <p className="text-xs mb-1" style={{ color: meta.color }}>{meta.label}</p>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Nickname</label>
          <p className="text-[10px] text-muted mb-1.5">Display name shown in the app</p>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            required autoFocus className="field"
          />
        </div>
        {account.type === 'credit_card' && (
          <>
            <div>
              <label className="text-xs text-muted block mb-1.5">Credit limit (optional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                <input
                  type="number" inputMode="decimal" step="0.01" min="0"
                  value={limitValue} onChange={e => setLimitValue(e.target.value)}
                  placeholder="0.00" className="field pl-7"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Payment due day (optional)</label>
              <input
                type="number" inputMode="numeric" min="1" max="31"
                value={dueDay} onChange={e => setDueDay(e.target.value)}
                placeholder="e.g. 15" className="field"
              />
            </div>
          </>
        )}
        <button type="submit" disabled={updateAccount.isPending || !name.trim()} className="btn-primary py-3">
          {updateAccount.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      {/* Bank sync */}
      <div className="px-4 pt-2 pb-2">
        <div className="card px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text">Bank sync</p>
            {account.teller_enrollment_id ? (
              <p className="text-xs text-success mt-0.5">
                Connected{account.teller_institution_name ? ` · ${account.teller_institution_name}` : ''}
              </p>
            ) : (
              <p className="text-xs text-muted mt-0.5">Not linked — tap to connect</p>
            )}
          </div>
          <button
            type="button"
            onClick={onConnectBank}
            className={account.teller_enrollment_id ? 'btn text-xs py-1.5 px-3' : 'btn-primary text-xs py-1.5 px-3'}
          >
            {account.teller_enrollment_id ? 'Reconnect' : 'Connect bank'}
          </button>
        </div>
      </div>

      {/* Delete */}
      <div className="px-4 pt-2 pb-4">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting || deleteAccount.isPending}
          className="w-full py-3 rounded-xl text-sm font-medium text-danger border border-danger/30 bg-danger/5 active:bg-danger/10 transition-colors"
        >
          {deleting || deleteAccount.isPending ? 'Deleting…' : 'Delete account'}
        </button>
      </div>
    </Sheet>
  )
}

// ─── Connect Bank Sheet (reconnect existing) ──────────────────────────────────

function ConnectBankSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const [scriptReady,     setScriptReady]     = useState(false)
  const [scriptError,     setScriptError]     = useState(false)
  const [tellerAccts,     setTellerAccts]     = useState<TellerConnectAccount[] | null>(null)
  const [accessToken,     setAccessToken]     = useState<string | null>(null)
  const [institutionName, setInstitutionName] = useState<string | null>(null)
  const [selectedId,      setSelectedId]      = useState<string | null>(null)

  const enroll      = useTellerEnroll()
  const linkAccount = useLinkAccountToTeller()
  const tellerSync  = useTellerSync()
  const loadScript  = useLoadTellerConnect()

  useEffect(() => {
    loadScript()
      .then(() => setScriptReady(true))
      .catch(() => setScriptError(true))
  }, [loadScript])

  function openTeller() {
    if (!window.TellerConnect) return
    const appId = import.meta.env.VITE_TELLER_APP_ID as string
    const tc = window.TellerConnect.setup({
      applicationId: appId,
      environment:   'production',
      products:      ['transactions', 'balance'],
      onSuccess: (enrollment) => {
        const inst = enrollment.accounts[0]?.institution?.name ?? null
        setAccessToken(enrollment.accessToken)
        setInstitutionName(inst)
        setTellerAccts(enrollment.accounts)
        if (enrollment.accounts.length === 1) setSelectedId(enrollment.accounts[0].id)
      },
      onExit: () => {}
    })
    tc.open()
  }

  async function confirmLink() {
    if (!tellerAccts || !selectedId || !accessToken) return
    const result = await enroll.mutateAsync({
      access_token:     accessToken,
      institution_name: institutionName
    })
    await linkAccount.mutateAsync({
      account_id:              account.id,
      teller_account_id:       selectedId,
      teller_enrollment_db_id: result.enrollment_db_id,
      institution_name:        institutionName
    })
    await tellerSync.mutateAsync()
    onClose()
  }

  const meta = ACCOUNT_TYPE_META[account.type]

  if (tellerAccts) {
    return (
      <Sheet onClose={onClose} title="Select account" maxHeight="75vh">
        <div className="px-4 pb-4">
          <p className="text-sm text-subtle mb-4">
            Which account is <span className="font-medium text-text">"{account.name}"</span>?
          </p>
          <div className="flex flex-col gap-2 mb-4">
            {tellerAccts.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedId(a.id)}
                className={`card px-4 py-3 text-left flex items-center justify-between transition-colors ${
                  selectedId === a.id ? 'border-2 border-accent' : ''
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-text">{a.name}</p>
                  <p className="text-xs text-muted mt-0.5 capitalize">
                    {a.subtype.replace(/_/g, ' ')}{a.last_four ? ` ····${a.last_four}` : ''}
                  </p>
                </div>
                {selectedId === a.id && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={confirmLink}
            disabled={!selectedId || enroll.isPending || linkAccount.isPending || tellerSync.isPending}
            className="btn-primary w-full py-3"
          >
            {enroll.isPending || linkAccount.isPending || tellerSync.isPending ? 'Linking…' : 'Link account'}
          </button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={onClose} title="Connect bank" maxHeight="55vh">
      <div className="px-4 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${meta.color}20` }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">{account.name}</p>
            <p className="text-xs text-muted">{meta.label}</p>
          </div>
        </div>
        <p className="text-sm text-subtle mb-5">
          Connect your bank via Teller to automatically sync your balance. Your credentials go directly to your bank — they're never stored here.
        </p>
        {scriptError ? (
          <p className="text-sm text-danger">Could not load Teller Connect. Check your internet connection.</p>
        ) : (
          <button
            onClick={openTeller}
            disabled={!scriptReady}
            className="btn-primary w-full py-3"
          >
            {scriptReady ? 'Connect with Teller' : 'Loading…'}
          </button>
        )}
      </div>
    </Sheet>
  )
}
