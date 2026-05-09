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
import { UpdateBalanceSheet } from '../components/UpdateBalanceSheet'
import { Sheet } from '../components/Sheet'
import { currentCycleStart, todayISO } from '../lib/cycle'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney, parseCents } from '../lib/money'
import type { Account, AccountType } from '../lib/supabase'
import type { TellerConnectAccount } from '../lib/teller.d'

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

  const [balanceTarget, setBalanceTarget] = useState<Account | null>(null)
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
            <p className="text-xs text-muted">Add your credit cards, checking, savings, and investment accounts.</p>
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 px-5 py-2 text-sm">
              Add first account
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
                  onTap={() => { if (!a.teller_enrollment_id) setBalanceTarget(a) }}
                  onEdit={() => setEditTarget(a)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {balanceTarget && (
        <UpdateBalanceSheet
          account={balanceTarget}
          currentBalance={balanceMap.get(balanceTarget.id) ?? null}
          onClose={() => setBalanceTarget(null)}
        />
      )}

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

      {showAdd && <AddAccountSheet onClose={() => setShowAdd(false)} />}
    </div>
  )
}

// ─── Add Account Sheet ────────────────────────────────────────────────────────

function AddAccountSheet({ onClose }: { onClose: () => void }) {
  const addAccount    = useAddAccount()
  const updateAccount = useUpdateAccount()
  const { data: accounts = [] } = useAccounts()

  const [name,       setName]       = useState('')
  const [type,       setType]       = useState<AccountType>('credit_card')
  const [limitValue, setLimitValue] = useState('')
  const [dueDay,     setDueDay]     = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await addAccount.mutateAsync({
      name: name.trim(),
      type,
      credit_limit_cents: type === 'credit_card' && limitValue ? parseCents(limitValue) : null,
      due_day: type === 'credit_card' && dueDay ? Number(dueDay) : null
    })
    onClose()
  }

  async function confirmArchive(account: Account) {
    if (!confirm(`Archive "${account.name}"? It will no longer appear in your dashboard.`)) return
    await updateAccount.mutateAsync({ id: account.id, archived: true })
  }

  return (
    <Sheet onClose={onClose} title="Add account" maxHeight="90vh">
      <form onSubmit={submit} className="px-4 flex flex-col gap-4 pb-4">
        <div>
          <label className="text-xs text-muted block mb-1.5">Account name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Chase Freedom, Vanguard"
            required
            autoFocus
            className="field"
          />
        </div>

        <div>
          <label className="text-xs text-muted block mb-1.5">Type</label>
          <div className="grid grid-cols-2 gap-1.5">
            {ACCOUNT_TYPES.map(t => {
              const meta = ACCOUNT_TYPE_META[t]
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`card px-3 py-2.5 text-left text-sm transition-colors ${type === t ? 'border-2' : ''}`}
                  style={type === t ? { borderColor: meta.color, color: meta.color } : {}}
                >
                  {meta.label}
                </button>
              )
            })}
          </div>
        </div>

        {type === 'credit_card' && (
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

        <button type="submit" disabled={addAccount.isPending || !name.trim()} className="btn-primary py-3 mt-1">
          {addAccount.isPending ? 'Adding…' : 'Add account'}
        </button>
      </form>

      {accounts.length > 0 && (
        <div className="px-4 pb-4">
          <p className="text-xs text-muted mb-3 uppercase tracking-wider">Archive account</p>
          <div className="flex flex-col gap-1">
            {accounts.map(a => (
              <button
                key={a.id}
                onClick={() => confirmArchive(a)}
                className="w-full card px-3 py-2.5 text-left text-sm text-subtle flex items-center justify-between"
              >
                <span>{a.name}</span>
                <span className="text-xs text-muted">{ACCOUNT_TYPE_META[a.type].label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
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
  const [dueDay,    setDueDay]    = useState(account.due_day ? String(account.due_day) : '')
  const [deleting,  setDeleting]  = useState(false)

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
    const hasTeller = Boolean(account.teller_enrollment_id)
    const msg = hasTeller
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
          <label className="text-xs text-muted block mb-1.5">Account name</label>
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

      {/* Teller section */}
      <div className="px-4 pt-2 pb-2">
        <div className="card px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text">Bank sync</p>
            {account.teller_enrollment_id ? (
              <p className="text-xs text-success mt-0.5">
                Connected{account.teller_institution_name ? ` · ${account.teller_institution_name}` : ''}
              </p>
            ) : (
              <p className="text-xs text-muted mt-0.5">Auto-sync balances via Teller</p>
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
        {account.teller_enrollment_id && (
          <p className="text-xs text-warning mb-2">
            Deleting this account will also remove its bank connection. You can reconnect later.
          </p>
        )}
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

// ─── Connect Bank Sheet (Teller Connect) ─────────────────────────────────────

function ConnectBankSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const [scriptReady,   setScriptReady]   = useState(false)
  const [scriptError,   setScriptError]   = useState(false)
  const [tellerAccts,   setTellerAccts]   = useState<TellerConnectAccount[] | null>(null)
  const [accessToken,   setAccessToken]   = useState<string | null>(null)
  const [institutionName, setInstitutionName] = useState<string | null>(null)
  const [selectedId,    setSelectedId]    = useState<string | null>(null)

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
      environment: 'production',
      products: ['transactions', 'balance'],
      onSuccess: (enrollment) => {
        const inst = enrollment.accounts[0]?.institution?.name ?? null
        setAccessToken(enrollment.accessToken)
        setInstitutionName(inst)
        setTellerAccts(enrollment.accounts)
        if (enrollment.accounts.length === 1) setSelectedId(enrollment.accounts[0].id)
      },
      onExit: () => { /* user dismissed */ }
    })
    tc.open()
  }

  async function confirmLink() {
    if (!tellerAccts || !selectedId || !accessToken) return
    const result = await enroll.mutateAsync({
      access_token: accessToken,
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

  // Step 2 — account picker
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
                    {a.subtype.replace('_', ' ')}{a.last_four ? ` ····${a.last_four}` : ''}
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
            {enroll.isPending || linkAccount.isPending || tellerSync.isPending
              ? 'Linking…'
              : 'Link account'}
          </button>
        </div>
      </Sheet>
    )
  }

  // Step 1 — initiate Teller Connect
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
