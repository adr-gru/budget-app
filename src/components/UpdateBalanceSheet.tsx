import { useState, useEffect } from 'react'
import type { Account } from '../lib/supabase'
import { ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney, parseCents, formatDollars } from '../lib/money'
import { useUpdateBalance } from '../data/snapshots'
import { useUpdateAccount, useDeleteAccount } from '../data/accounts'
import { Sheet } from './Sheet'
import { ConfirmSheet } from './ConfirmSheet'

interface Props {
  account: Account
  currentBalance: number | null
  onClose: () => void
}

export function UpdateBalanceSheet({ account, currentBalance, onClose }: Props) {
  const [balance,    setBalance]    = useState(currentBalance !== null ? formatDollars(currentBalance) : '')
  const [name,       setName]       = useState(account.name)
  const [limitValue, setLimitValue] = useState(account.credit_limit_cents ? String(account.credit_limit_cents / 100) : '')
  const [dueDay,     setDueDay]     = useState(account.due_day ? String(account.due_day) : '')
  const [confirming, setConfirming] = useState(false)

  const updateBalance = useUpdateBalance()
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()
  const meta = ACCOUNT_TYPE_META[account.type]

  useEffect(() => {
    setBalance(currentBalance !== null ? formatDollars(currentBalance) : '')
  }, [currentBalance])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const nameChanged  = name.trim() !== account.name
    const limitChanged = account.type === 'credit_card' && parseCents(limitValue) !== (account.credit_limit_cents ?? 0)
    const dueChanged   = account.type === 'credit_card' && (Number(dueDay) || null) !== account.due_day

    await Promise.all([
      updateBalance.mutateAsync({ account_id: account.id, balance_cents: parseCents(balance), account_type: account.type }),
      (nameChanged || limitChanged || dueChanged) && updateAccount.mutateAsync({
        id: account.id,
        name: name.trim(),
        credit_limit_cents: account.type === 'credit_card' && limitValue ? parseCents(limitValue) : account.credit_limit_cents,
        due_day: account.type === 'credit_card' && dueDay ? Number(dueDay) : account.due_day,
      }),
    ])
    onClose()
  }

  const isPending = updateBalance.isPending || updateAccount.isPending

  return (
    <>
      <Sheet onClose={onClose} maxHeight="85vh">
        <form onSubmit={submit} className="px-5 pb-2 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: meta.color }}>{meta.label}</p>
            {currentBalance !== null && (
              <p className="text-xs text-subtle tabular-nums">Current: {formatMoney(currentBalance)}</p>
            )}
          </div>

          <div>
            <label className="text-xs text-muted block mb-1.5">Balance</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={balance}
                onChange={e => setBalance(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="field pl-7 text-base tabular-nums"
              />
            </div>
            <p className="text-xs text-muted mt-1">
              {account.type === 'credit_card' ? 'Amount you currently owe' : 'Current balance'}
            </p>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1.5">Nickname</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="field"
            />
          </div>

          {account.type === 'credit_card' && (
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

          <button type="submit" disabled={isPending || !name.trim()} className="btn-primary py-3">
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </form>

        <div className="px-5 pt-2 pb-5">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={deleteAccount.isPending}
            className="w-full py-3 rounded-lg text-sm font-medium text-danger border border-danger/25 bg-danger/5 hover:bg-danger/10 transition-colors"
          >
            Delete account
          </button>
        </div>
      </Sheet>

      {confirming && (
        <ConfirmSheet
          title="Delete account"
          message={`Delete "${account.name}"? All balance history will be removed. Cannot be undone.`}
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            await deleteAccount.mutateAsync(account.id)
            onClose()
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  )
}
