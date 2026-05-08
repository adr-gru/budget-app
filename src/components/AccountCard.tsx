import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { Account } from '../lib/supabase'
import { ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney } from '../lib/money'

function daysUntilDue(dueDay: number): number {
  const today = new Date()
  let due = new Date(today.getFullYear(), today.getMonth(), dueDay)
  if (due <= today) due = new Date(today.getFullYear(), today.getMonth() + 1, dueDay)
  return differenceInCalendarDays(due, today)
}

function lastUpdatedLabel(recordedAt: string | null): string | null {
  if (!recordedAt) return null
  const days = differenceInCalendarDays(new Date(), parseISO(recordedAt))
  if (days === 0) return 'Updated today'
  if (days === 1) return 'Updated yesterday'
  if (days < 30) return `Updated ${days}d ago`
  return `Updated ${Math.floor(days / 30)}mo ago`
}

interface Props {
  account: Account
  balance: number | null
  delta: number | null
  lastSnapshotAt: string | null
  onTap: () => void
}

export function AccountCard({ account, balance, delta, lastSnapshotAt, onTap }: Props) {
  const meta = ACCOUNT_TYPE_META[account.type]
  const hasActivity = delta !== null && delta !== 0
  const utilization = account.type === 'credit_card' && account.credit_limit_cents && balance !== null
    ? Math.round((balance / account.credit_limit_cents) * 100)
    : null
  const dueDays = account.type === 'credit_card' && account.due_day
    ? daysUntilDue(account.due_day)
    : null
  const dueSoon = dueDays !== null && dueDays <= 5
  const updatedLabel = lastUpdatedLabel(lastSnapshotAt)

  return (
    <button
      onClick={onTap}
      className="w-full card px-4 py-3.5 flex items-center gap-3 text-left active:bg-elev transition-colors"
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text truncate">{account.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {utilization !== null && (
            <span className={`text-xs ${utilization >= 80 ? 'text-danger' : utilization >= 30 ? 'text-[#fbbf24]' : 'text-muted'}`}>
              {utilization}% used
            </span>
          )}
          {account.credit_limit_cents && balance !== null && (
            <span className="text-xs text-muted">
              {formatMoney(account.credit_limit_cents - balance)} avail.
            </span>
          )}
          {dueDays !== null && (
            <span className={`text-xs ${dueSoon ? 'text-danger font-medium' : 'text-muted'}`}>
              Due in {dueDays}d
            </span>
          )}
          {!utilization && !dueDays && updatedLabel && (
            <span className="text-xs text-muted">{updatedLabel}</span>
          )}
        </div>
        {(utilization !== null || dueDays !== null) && updatedLabel && (
          <p className="text-xs text-muted mt-0.5">{updatedLabel}</p>
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
            {delta! > 0 ? '+' : ''}{formatMoney(delta!)}
          </p>
        )}
      </div>
    </button>
  )
}
