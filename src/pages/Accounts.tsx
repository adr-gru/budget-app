import { useState } from 'react'
import { useAccounts, useAddAccount, useArchiveAccount } from '../data/accounts'
import { useLatestBalances, useCycleActivitySnapshots, computeActivity } from '../data/snapshots'
import { useProfile } from '../data/profile'
import { AccountCard } from '../components/AccountCard'
import { UpdateBalanceSheet } from '../components/UpdateBalanceSheet'
import { currentCycleStart, todayISO } from '../lib/cycle'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney, parseCents } from '../lib/money'
import type { Account, AccountType } from '../lib/supabase'

export function Accounts() {
  const { data: accounts = [] } = useAccounts()
  const { data: latestBalances = [] } = useLatestBalances()
  const { data: profile } = useProfile()

  const anchor = profile?.cycle_anchor_date ?? todayISO()
  const cycleStart = currentCycleStart(anchor)
  const { data: activitySnapshots = [] } = useCycleActivitySnapshots(cycleStart)

  const balanceMap = new Map(latestBalances.map(s => [s.account_id, s.balance_cents]))
  const activityMap = computeActivity(activitySnapshots, cycleStart)

  const [balanceTarget, setBalanceTarget] = useState<Account | null>(null)
  const [showAdd, setShowAdd]             = useState(false)

  const accountsByType = ACCOUNT_TYPES.reduce((acc, type) => {
    acc[type] = accounts.filter(a => a.type === type)
    return acc
  }, {} as Record<AccountType, Account[]>)

  const hasAny = accounts.length > 0

  return (
    <div className="pb-24">
      <div className="px-4 pt-12 pb-4 border-b border-border flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">Accounts</h1>
        <button onClick={() => setShowAdd(true)} className="btn text-sm gap-1.5">
          <span className="text-base leading-none">+</span> Add
        </button>
      </div>

      {!hasAny && (
        <div className="px-4 pt-5">
          <div className="card px-4 py-4 text-center">
            <p className="text-sm text-subtle">No accounts yet.</p>
            <p className="text-xs text-muted mt-1">Add your credit cards, checking, savings, and investment accounts.</p>
          </div>
        </div>
      )}

      {ACCOUNT_TYPES.map(type => {
        const list = accountsByType[type]
        if (list.length === 0) return null
        const meta = ACCOUNT_TYPE_META[type]
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
                  onTap={() => setBalanceTarget(a)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Update balance sheet */}
      {balanceTarget && (
        <UpdateBalanceSheet
          account={balanceTarget}
          currentBalance={balanceMap.get(balanceTarget.id) ?? null}
          onClose={() => setBalanceTarget(null)}
        />
      )}

      {/* Add account sheet */}
      {showAdd && (
        <AddAccountSheet onClose={() => setShowAdd(false)} />
      )}
    </div>
  )
}

function AddAccountSheet({ onClose }: { onClose: () => void }) {
  const addAccount = useAddAccount()
  const archiveAccount = useArchiveAccount()
  const { data: accounts = [] } = useAccounts()

  const [name, setName]           = useState('')
  const [type, setType]           = useState<AccountType>('credit_card')
  const [limitValue, setLimitValue] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const creditLimit = type === 'credit_card' && limitValue
      ? parseCents(limitValue)
      : null
    await addAccount.mutateAsync({ name: name.trim(), type, credit_limit_cents: creditLimit })
    onClose()
  }

  async function confirmArchive(account: Account) {
    if (!confirm(`Archive "${account.name}"? It will no longer appear in your dashboard.`)) return
    await archiveAccount.mutateAsync(account.id)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border rounded-t-xl px-4 pt-5 overflow-y-auto"
        style={{ maxHeight: '85vh', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <p className="text-base font-semibold text-text mb-5">Add account</p>

        <form onSubmit={submit} className="flex flex-col gap-4">
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
                    className={`card px-3 py-2.5 text-left text-sm transition-colors ${
                      type === t ? 'border-2' : ''
                    }`}
                    style={type === t ? { borderColor: meta.color, color: meta.color } : {}}
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          {type === 'credit_card' && (
            <div>
              <label className="text-xs text-muted block mb-1.5">Credit limit (optional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={limitValue}
                  onChange={e => setLimitValue(e.target.value)}
                  placeholder="0.00"
                  className="field pl-7"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={addAccount.isPending || !name.trim()}
            className="btn-primary py-3 mt-1"
          >
            {addAccount.isPending ? 'Adding…' : 'Add account'}
          </button>
        </form>

        {/* Archive existing accounts */}
        {accounts.length > 0 && (
          <div className="mt-6 mb-2">
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
      </div>
    </>
  )
}
