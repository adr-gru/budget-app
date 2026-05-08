import { Account } from '../lib/supabase'
import { ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney } from '../lib/money'

interface Props {
  account: Account
  balance: number | null
  delta: number | null
  onTap: () => void
}

export function AccountCard({ account, balance, delta, onTap }: Props) {
  const meta = ACCOUNT_TYPE_META[account.type]
  const hasActivity = delta !== null && delta !== 0

  return (
    <button
      onClick={onTap}
      className="w-full card px-4 py-3.5 flex items-center gap-3 text-left active:bg-elev transition-colors"
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: meta.color }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text truncate">{account.name}</p>
        {account.type === 'credit_card' && account.credit_limit_cents && balance !== null && (
          <p className="text-xs text-muted mt-0.5">
            {Math.round((balance / account.credit_limit_cents) * 100)}% of {formatMoney(account.credit_limit_cents)} limit
          </p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold tabular-nums text-text">
          {balance !== null ? formatMoney(balance) : <span className="text-muted">—</span>}
        </p>
        {hasActivity && (
          <p className={`text-xs tabular-nums mt-0.5 ${
            meta.isDebt
              ? delta! > 0 ? 'text-danger' : 'text-success'
              : delta! > 0 ? 'text-success' : 'text-danger'
          }`}>
            {delta! > 0 ? '+' : ''}{formatMoney(delta!)} this cycle
          </p>
        )}
      </div>
    </button>
  )
}
