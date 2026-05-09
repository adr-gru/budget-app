import { useState } from 'react'
import { useAccounts, useAddAccount, useUpdateAccount, useDeleteAccount } from '../data/accounts'
import {
  usePlaidSync,
  usePlaidExchange,
  useLinkAccountToPlaid,
  useLoadPlaidLink,
  usePlaidLinkTokenImperative,
} from '../data/plaid'
import { useLatestBalances, useCycleActivitySnapshots, computeActivity, useUpdateBalance } from '../data/snapshots'
import { useProfile } from '../data/profile'
import { AccountCard } from '../components/AccountCard'
import { UpdateBalanceSheet } from '../components/UpdateBalanceSheet'
import { Sheet } from '../components/Sheet'
import { Skeleton } from '../components/Skeleton'
import { currentCycleStart, todayISO } from '../lib/cycle'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney, parseCents } from '../lib/money'
import type { Account, AccountType } from '../lib/supabase'
import type { PlaidLinkAccount } from '../lib/plaid.d'

function mapPlaidType(type: string, subtype: string): AccountType {
  if (type === 'credit') return 'credit_card'
  if (type === 'investment') return 'investment'
  const savingsSubtypes = ['savings', 'cd', 'money market', 'cash management']
  if (savingsSubtypes.includes(subtype.toLowerCase())) return 'savings'
  return 'checking'
}

function isLinked(a: Account) {
  return Boolean(a.plaid_item_id || a.teller_enrollment_id)
}

export function Accounts() {
  const { data: accounts = [], isLoading } = useAccounts()
  const { data: latestBalances = [] }      = useLatestBalances()
  const { data: profile }                  = useProfile()
  const plaidSync                          = usePlaidSync()

  const anchor     = profile?.cycle_anchor_date ?? todayISO()
  const cycleStart = currentCycleStart(anchor)
  const { data: activitySnapshots = [] } = useCycleActivitySnapshots(cycleStart)

  const balanceMap     = new Map(latestBalances.map(s => [s.account_id, s.balance_cents]))
  const lastUpdatedMap = new Map(latestBalances.map(s => [s.account_id, s.recorded_at]))
  const activityMap    = computeActivity(activitySnapshots, cycleStart)

  const [editTarget,    setEditTarget]    = useState<Account | null>(null)
  const [balanceTarget, setBalanceTarget] = useState<Account | null>(null)
  const [connectTarget, setConnectTarget] = useState<Account | null>(null)
  const [showAdd,       setShowAdd]       = useState(false)
  const [showManage,    setShowManage]    = useState(false)

  const hasLinked = accounts.some(isLinked)

  const accountsByType = ACCOUNT_TYPES.reduce((acc, type) => {
    acc[type] = accounts.filter(a => a.type === type)
    return acc
  }, {} as Record<AccountType, Account[]>)

  return (
    <div className="pb-24 lg:pb-8">
      <div className="px-4 lg:px-6 pt-6 lg:pt-8 pb-4 border-b border-border flex items-center justify-between">
        <h1 className="page-title">Accounts</h1>
        <div className="flex items-center gap-2">
          {hasLinked && (
            <button
              onClick={() => plaidSync.mutate()}
              disabled={plaidSync.isPending}
              className="btn-ghost text-xs gap-1.5"
              aria-label="Sync balances"
            >
              <svg
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={plaidSync.isPending ? 'animate-spin' : ''}
              >
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {plaidSync.isPending ? 'Syncing…' : 'Sync'}
            </button>
          )}
          <button onClick={() => setShowManage(true)} className="btn text-sm">
            Manage
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 lg:px-6 pt-5 flex flex-col gap-3">
          {[0,1,2].map(i => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : accounts.length === 0 ? (
        <div className="px-4 lg:px-6 pt-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-elev flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>
          <p className="text-base font-display font-semibold text-text mb-1">No accounts yet</p>
          <p className="text-sm text-muted mb-5 max-w-xs">Add accounts manually or connect your bank via Plaid to sync balances automatically.</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary px-6 py-2.5">
            Add first account
          </button>
        </div>
      ) : (
        <>
          {ACCOUNT_TYPES.map(type => {
            const list = accountsByType[type]
            if (list.length === 0) return null
            const meta  = ACCOUNT_TYPE_META[type]
            const total = list.reduce((sum, a) => sum + (balanceMap.get(a.id) ?? 0), 0)

            return (
              <div key={type} className="px-4 lg:px-6 pt-6">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                    <p className="section-label">{meta.label}</p>
                  </div>
                  <p className="font-mono text-xs tabular-nums font-semibold" style={{ color: meta.color }}>
                    {formatMoney(total)}
                  </p>
                </div>
                <div className="flex flex-col gap-2.5">
                  {list.map(a => (
                    <AccountCard
                      key={a.id}
                      account={a}
                      balance={balanceMap.get(a.id) ?? null}
                      delta={activityMap.get(a.id)?.delta ?? null}
                      lastSnapshotAt={lastUpdatedMap.get(a.id) ?? null}
                      onTap={() => isLinked(a) ? setEditTarget(a) : setBalanceTarget(a)}
                      onEdit={() => setEditTarget(a)}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          <div className="px-4 lg:px-6 pt-5">
            <button
              onClick={() => setShowAdd(true)}
              className="w-full card px-4 py-3.5 flex items-center gap-3 hover:bg-elev/40 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-accent">Add account</p>
            </button>
          </div>
        </>
      )}

      {editTarget && (
        <EditAccountSheet
          account={editTarget}
          onConnectBank={() => { setEditTarget(null); setConnectTarget(editTarget) }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {balanceTarget && (
        <UpdateBalanceSheet
          account={balanceTarget}
          currentBalance={balanceMap.get(balanceTarget.id) ?? null}
          onClose={() => setBalanceTarget(null)}
        />
      )}

      {connectTarget && (
        <ConnectBankSheet
          account={connectTarget}
          onClose={() => setConnectTarget(null)}
        />
      )}

      {showManage && (
        <ManageAccountsSheet
          accounts={accounts}
          onClose={() => setShowManage(false)}
          onConnectNew={() => { setShowManage(false); setShowAdd(true) }}
        />
      )}

      {showAdd && <AddAccountSheet onClose={() => setShowAdd(false)} />}
    </div>
  )
}

// ─── Manage Accounts Sheet ────────────────────────────────────────────────────

function ManageAccountsSheet({
  accounts, onClose, onConnectNew
}: {
  accounts: Account[]
  onClose: () => void
  onConnectNew: () => void
}) {
  const [ordered, setOrdered] = useState(() => [...accounts])
  const updateAccount = useUpdateAccount()

  function move(idx: number, direction: -1 | 1) {
    const to = idx + direction
    if (to < 0 || to >= ordered.length) return
    const next = [...ordered]
    ;[next[idx], next[to]] = [next[to], next[idx]]
    setOrdered(next)
    updateAccount.mutate({ id: next[idx].id, sort_order: idx })
    updateAccount.mutate({ id: next[to].id, sort_order: to })
  }

  return (
    <Sheet onClose={onClose} title="Manage accounts" maxHeight="90vh">
      <div className="px-5 pb-5 flex flex-col gap-2">
        {ordered.map((account, i) => {
          const meta = ACCOUNT_TYPE_META[account.type]
          const linked = isLinked(account)
          const institution = account.plaid_institution_name ?? account.teller_institution_name
          return (
            <div key={account.id} className="card px-4 py-3 flex items-center gap-3">
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="p-1 text-muted disabled:opacity-25 hover:text-text transition-colors"
                  aria-label="Move up"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === ordered.length - 1}
                  className="p-1 text-muted disabled:opacity-25 hover:text-text transition-colors"
                  aria-label="Move down"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">{account.name}</p>
                <p className="text-xs mt-0.5" style={{ color: meta.color }}>
                  {meta.label}{institution ? ` · ${institution}` : ''}
                </p>
              </div>
              {linked ? (
                <div className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
              ) : (
                <span className="text-[10px] text-muted flex-shrink-0">manual</span>
              )}
            </div>
          )
        })}
        <button
          type="button"
          onClick={onConnectNew}
          className="card px-4 py-3 flex items-center gap-3 w-full text-left hover:bg-elev/40 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-accent">Add account</p>
        </button>
      </div>
    </Sheet>
  )
}

// ─── Add Account Sheet ────────────────────────────────────────────────────────

interface AccountConfig {
  checked:    boolean
  nickname:   string
  limitValue: string
  dueDay:     string
}

function AddAccountSheet({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<'choose' | 'manual' | 'import'>('choose')

  // Manual form state
  const [name,        setName]        = useState('')
  const [type,        setType]        = useState<AccountType>('checking')
  const [limitValue,  setLimitValue]  = useState('')
  const [dueDay,      setDueDay]      = useState('')
  const [initBalance, setInitBalance] = useState('')
  const [savingManual, setSavingManual] = useState(false)

  // Plaid flow state
  const [bankLoading,     setBankLoading]     = useState(false)
  const [bankError,       setBankError]       = useState(false)
  const [plaidAccts,      setPlaidAccts]      = useState<PlaidLinkAccount[] | null>(null)
  const [publicToken,     setPublicToken]     = useState<string | null>(null)
  const [institutionName, setInstitutionName] = useState<string | null>(null)
  const [config,          setConfig]          = useState<Record<string, AccountConfig>>({})
  const [importing,       setImporting]       = useState(false)

  const addAccount    = useAddAccount()
  const updateBalance = useUpdateBalance()
  const getLinkToken  = usePlaidLinkTokenImperative()
  const exchange      = usePlaidExchange()
  const linkToPlaid   = useLinkAccountToPlaid()
  const plaidSync     = usePlaidSync()
  const loadPlaid     = useLoadPlaidLink()

  async function submitManual(e: React.FormEvent) {
    e.preventDefault()
    setSavingManual(true)
    try {
      const newAcct = await addAccount.mutateAsync({
        name: name.trim(),
        type,
        credit_limit_cents: type === 'credit_card' && limitValue ? parseCents(limitValue) : null,
        due_day:            type === 'credit_card' && dueDay ? Number(dueDay) : null,
      })
      if (initBalance) {
        await updateBalance.mutateAsync({
          account_id:    newAcct.id,
          balance_cents: parseCents(initBalance),
          account_type:  type,
        })
      }
      onClose()
    } finally {
      setSavingManual(false)
    }
  }

  async function openBank() {
    setBankLoading(true)
    setBankError(false)
    try {
      await loadPlaid()
      const linkToken = await getLinkToken()
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: (publicTkn, metadata) => {
          setPublicToken(publicTkn)
          setInstitutionName(metadata.institution?.name ?? null)
          setPlaidAccts(metadata.accounts)
          const defaults: Record<string, AccountConfig> = {}
          for (const a of metadata.accounts) {
            defaults[a.id] = { checked: true, nickname: a.name, limitValue: '', dueDay: '' }
          }
          setConfig(defaults)
          setView('import')
        },
        onExit: () => { setBankLoading(false) },
      })
      handler.open()
    } catch {
      setBankError(true)
      setBankLoading(false)
    }
  }

  function updateConfig(id: string, patch: Partial<AccountConfig>) {
    setConfig(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function confirmImport() {
    if (!plaidAccts || !publicToken) return
    setImporting(true)
    try {
      const { plaid_item_db_id } = await exchange.mutateAsync({
        public_token:     publicToken,
        institution_name: institutionName,
      })
      for (const pa of plaidAccts) {
        const cfg = config[pa.id]
        if (!cfg?.checked) continue
        const acctType = mapPlaidType(pa.type, pa.subtype)
        const newAcct  = await addAccount.mutateAsync({
          name:               cfg.nickname.trim() || pa.name,
          type:               acctType,
          credit_limit_cents: acctType === 'credit_card' && cfg.limitValue ? parseCents(cfg.limitValue) : null,
          due_day:            acctType === 'credit_card' && cfg.dueDay ? Number(cfg.dueDay) : null,
        })
        await linkToPlaid.mutateAsync({
          account_id:       newAcct.id,
          plaid_account_id: pa.id,
          plaid_item_db_id,
          institution_name: institutionName,
        })
      }
      await plaidSync.mutateAsync()
      onClose()
    } finally {
      setImporting(false)
    }
  }

  // ── Import review view ──
  if (view === 'import' && plaidAccts) {
    const selectedCount = plaidAccts.filter(a => config[a.id]?.checked).length
    return (
      <Sheet onClose={onClose} title="Import accounts" maxHeight="90vh">
        <div className="px-5 pb-5">
          {institutionName && (
            <p className="text-sm text-muted mb-4">
              Found {plaidAccts.length} account{plaidAccts.length !== 1 ? 's' : ''} at{' '}
              <strong className="text-text">{institutionName}</strong>
            </p>
          )}
          <div className="flex flex-col gap-3 mb-5">
            {plaidAccts.map(pa => {
              const cfg     = config[pa.id] ?? { checked: true, nickname: pa.name, limitValue: '', dueDay: '' }
              const acctType = mapPlaidType(pa.type, pa.subtype)
              return (
                <div
                  key={pa.id}
                  className={`card px-4 py-3 transition-opacity ${cfg.checked ? '' : 'opacity-50'}`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <button
                      type="button"
                      onClick={() => updateConfig(pa.id, { checked: !cfg.checked })}
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
                        {pa.subtype.replace(/_/g, ' ')}{pa.mask ? ` ····${pa.mask}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold" style={{ color: ACCOUNT_TYPE_META[acctType].color }}>
                      {ACCOUNT_TYPE_META[acctType].label}
                    </span>
                  </div>

                  {cfg.checked && (
                    <div className="flex flex-col gap-2 pl-8">
                      <div>
                        <label className="text-xs text-muted block mb-1">Nickname</label>
                        <input
                          type="text"
                          value={cfg.nickname}
                          onChange={e => updateConfig(pa.id, { nickname: e.target.value })}
                          className="field text-sm"
                          placeholder={pa.name}
                        />
                      </div>
                      {acctType === 'credit_card' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted block mb-1">Credit limit</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">$</span>
                              <input
                                type="number" inputMode="decimal" step="0.01" min="0"
                                value={cfg.limitValue}
                                onChange={e => updateConfig(pa.id, { limitValue: e.target.value })}
                                placeholder="0.00" className="field text-sm pl-6"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-muted block mb-1">Due day</label>
                            <input
                              type="number" inputMode="numeric" min="1" max="31"
                              value={cfg.dueDay}
                              onChange={e => updateConfig(pa.id, { dueDay: e.target.value })}
                              placeholder="e.g. 15" className="field text-sm"
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
            disabled={selectedCount === 0 || importing}
            className="btn-primary w-full py-3"
          >
            {importing
              ? 'Importing…'
              : selectedCount === 0
              ? 'Select at least one account'
              : `Import ${selectedCount} account${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </Sheet>
    )
  }

  // ── Manual form view ──
  if (view === 'manual') {
    const TYPES: { value: AccountType; label: string }[] = [
      { value: 'checking',   label: 'Checking' },
      { value: 'savings',    label: 'Savings' },
      { value: 'credit_card', label: 'Credit' },
      { value: 'investment', label: 'Investment' },
    ]
    return (
      <Sheet onClose={onClose} title="Add manually" maxHeight="90vh">
        <form onSubmit={submitManual} className="px-5 pb-5 flex flex-col gap-4">
          <div>
            <label className="text-xs text-muted block mb-1.5">Nickname</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
              placeholder="e.g. Chase Checking"
              className="field"
            />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1.5">Type</label>
            <div className="grid grid-cols-4 gap-1.5">
              {TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                    type === t.value
                      ? 'bg-accent text-white'
                      : 'bg-elev text-muted hover:text-text'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {type === 'credit_card' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted block mb-1.5">Credit limit</label>
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
                <label className="text-xs text-muted block mb-1.5">Due day</label>
                <input
                  type="number" inputMode="numeric" min="1" max="31"
                  value={dueDay} onChange={e => setDueDay(e.target.value)}
                  placeholder="e.g. 15" className="field"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-muted block mb-1.5">
              Starting balance <span className="text-muted/60">(optional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
              <input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={initBalance} onChange={e => setInitBalance(e.target.value)}
                placeholder="0.00" className="field pl-7"
              />
            </div>
          </div>

          <button type="submit" disabled={savingManual || !name.trim()} className="btn-primary py-3 mt-1">
            {savingManual ? 'Adding…' : 'Add account'}
          </button>
        </form>
      </Sheet>
    )
  }

  // ── Choose view (default) ──
  return (
    <Sheet onClose={onClose} title="Add account" maxHeight="55vh">
      <div className="px-5 pb-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setView('manual')}
          className="card px-4 py-4 flex items-center gap-4 text-left hover:bg-elev/40 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-elev flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Add manually</p>
            <p className="text-xs text-muted mt-0.5">Enter balances yourself — works with any bank</p>
          </div>
        </button>

        <button
          type="button"
          onClick={openBank}
          disabled={bankLoading}
          className="card px-4 py-4 flex items-center gap-4 text-left hover:bg-elev/40 transition-colors disabled:opacity-60"
        >
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">
              {bankLoading ? 'Connecting…' : 'Connect bank'}
            </p>
            <p className="text-xs text-muted mt-0.5">Auto-sync balances via Plaid</p>
          </div>
        </button>

        {bankError && (
          <p className="text-sm text-danger">Could not load Plaid. Check your connection and try again.</p>
        )}
      </div>
    </Sheet>
  )
}

// ─── Edit Account Sheet ───────────────────────────────────────────────────────

function EditAccountSheet({
  account, onConnectBank, onClose
}: {
  account: Account
  onConnectBank: () => void
  onClose: () => void
}) {
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()
  const meta          = ACCOUNT_TYPE_META[account.type]
  const linked        = isLinked(account)
  const institution   = account.plaid_institution_name ?? account.teller_institution_name

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
    const msg = linked
      ? `Delete "${account.name}"? This will disconnect its bank link and remove all balance history. Cannot be undone.`
      : `Delete "${account.name}"? All balance history will be removed. Cannot be undone.`
    if (!confirm(msg)) return
    setDeleting(true)
    await deleteAccount.mutateAsync(account.id)
    onClose()
  }

  return (
    <Sheet onClose={onClose} title="Edit account" maxHeight="90vh">
      <form onSubmit={submit} className="px-5 flex flex-col gap-4 pb-2">
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: meta.color }}>{meta.label}</p>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1.5">Nickname</label>
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

      <div className="px-5 pt-2 pb-2">
        <div className="card px-4 py-3.5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text">Bank sync</p>
            {linked ? (
              <p className="text-xs text-success mt-0.5">
                Connected{institution ? ` · ${institution}` : ''}
              </p>
            ) : (
              <p className="text-xs text-muted mt-0.5">Not linked — tap to connect via Plaid</p>
            )}
          </div>
          <button
            type="button"
            onClick={onConnectBank}
            className={linked ? 'btn text-xs' : 'btn-primary text-xs'}
          >
            {linked ? 'Reconnect' : 'Connect bank'}
          </button>
        </div>
      </div>

      <div className="px-5 pt-1 pb-5">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting || deleteAccount.isPending}
          className="w-full py-3 rounded-lg text-sm font-medium text-danger border border-danger/25 bg-danger/5 hover:bg-danger/10 transition-colors"
        >
          {deleting || deleteAccount.isPending ? 'Deleting…' : 'Delete account'}
        </button>
      </div>
    </Sheet>
  )
}

// ─── Connect Bank Sheet (link existing account to Plaid) ─────────────────────

function ConnectBankSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState(false)
  const [plaidAccts,      setPlaidAccts]      = useState<PlaidLinkAccount[] | null>(null)
  const [publicToken,     setPublicToken]     = useState<string | null>(null)
  const [institutionName, setInstitutionName] = useState<string | null>(null)
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [linking,         setLinking]         = useState(false)

  const getLinkToken = usePlaidLinkTokenImperative()
  const exchange     = usePlaidExchange()
  const linkToPlaid  = useLinkAccountToPlaid()
  const plaidSync    = usePlaidSync()
  const loadPlaid    = useLoadPlaidLink()

  async function openPlaid() {
    setLoading(true)
    setError(false)
    try {
      await loadPlaid()
      const linkToken = await getLinkToken()
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: (publicTkn, metadata) => {
          setPublicToken(publicTkn)
          setInstitutionName(metadata.institution?.name ?? null)
          setPlaidAccts(metadata.accounts)
          if (metadata.accounts.length === 1) setSelectedId(metadata.accounts[0].id)
        },
        onExit: () => { setLoading(false) },
      })
      handler.open()
    } catch {
      setError(true)
      setLoading(false)
    }
  }

  async function confirmLink() {
    if (!plaidAccts || !selectedId || !publicToken) return
    setLinking(true)
    try {
      const { plaid_item_db_id } = await exchange.mutateAsync({
        public_token:     publicToken,
        institution_name: institutionName,
      })
      await linkToPlaid.mutateAsync({
        account_id:       account.id,
        plaid_account_id: selectedId,
        plaid_item_db_id,
        institution_name: institutionName,
      })
      await plaidSync.mutateAsync()
      onClose()
    } finally {
      setLinking(false)
    }
  }

  const meta = ACCOUNT_TYPE_META[account.type]

  if (plaidAccts) {
    return (
      <Sheet onClose={onClose} title="Select account" maxHeight="75vh">
        <div className="px-5 pb-5">
          <p className="text-sm text-subtle mb-4">
            Which account is <span className="font-medium text-text">"{account.name}"</span>?
          </p>
          <div className="flex flex-col gap-2 mb-4">
            {plaidAccts.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedId(a.id)}
                className={`card px-4 py-3 text-left flex items-center justify-between transition-colors hover:bg-elev/40 ${
                  selectedId === a.id ? 'border-2 border-accent' : ''
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-text">{a.name}</p>
                  <p className="text-xs text-muted mt-0.5 capitalize">
                    {a.subtype.replace(/_/g, ' ')}{a.mask ? ` ····${a.mask}` : ''}
                  </p>
                </div>
                {selectedId === a.id && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={confirmLink}
            disabled={!selectedId || linking}
            className="btn-primary w-full py-3"
          >
            {linking ? 'Linking…' : 'Link account'}
          </button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={onClose} title="Connect bank" maxHeight="55vh">
      <div className="px-5 pb-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${meta.color}18` }}>
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
          Connect via Plaid to automatically sync your balance. Your credentials go directly to your bank — they're never stored here.
        </p>
        {error ? (
          <p className="text-sm text-danger">Could not load Plaid. Check your connection and try again.</p>
        ) : (
          <button
            onClick={openPlaid}
            disabled={loading}
            className="btn-primary w-full py-3"
          >
            {loading ? 'Loading…' : 'Connect with Plaid'}
          </button>
        )}
      </div>
    </Sheet>
  )
}
