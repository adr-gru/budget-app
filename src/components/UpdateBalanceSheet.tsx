import { useState, useEffect } from 'react'
import type { Account } from '../lib/supabase'
import { ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney, parseCents, formatDollars } from '../lib/money'
import { useUpdateBalance } from '../data/snapshots'
import { Sheet } from './Sheet'

interface Props {
  account: Account
  currentBalance: number | null
  onClose: () => void
}

export function UpdateBalanceSheet({ account, currentBalance, onClose }: Props) {
  const [value, setValue] = useState(currentBalance !== null ? formatDollars(currentBalance) : '')
  const updateBalance = useUpdateBalance()
  const meta = ACCOUNT_TYPE_META[account.type]

  useEffect(() => {
    setValue(currentBalance !== null ? formatDollars(currentBalance) : '')
  }, [currentBalance])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await updateBalance.mutateAsync({ account_id: account.id, balance_cents: parseCents(value), account_type: account.type })
    onClose()
  }

  return (
    <Sheet onClose={onClose} maxHeight="60vh">
      <div className="px-5 pb-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs mb-0.5" style={{ color: meta.color }}>{meta.label}</p>
            <p className="text-base font-semibold text-text">{account.name}</p>
          </div>
          {currentBalance !== null && (
            <p className="text-sm text-subtle tabular-nums">
              Current: {formatMoney(currentBalance)}
            </p>
          )}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="field pl-7 text-base tabular-nums"
            />
          </div>
          <p className="text-xs text-muted -mt-1">
            {account.type === 'credit_card' ? 'Enter the balance you currently owe' : 'Enter your current balance'}
          </p>
          <button type="submit" disabled={updateBalance.isPending} className="btn-primary py-3 mt-1">
            {updateBalance.isPending ? 'Saving…' : 'Update balance'}
          </button>
        </form>
      </div>
    </Sheet>
  )
}
