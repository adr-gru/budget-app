import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { Account } from '../lib/supabase'
import { CARD_GRADIENTS } from '../lib/tokens'
import { formatMoney } from '../lib/money'

const TYPE_LABEL: Record<string, string> = {
  credit_card: 'Credit Card',
  checking:    'Checking',
  savings:     'Savings',
  investment:  'Investment'
}

function daysUntilDue(dueDay: number): number {
  const today = new Date()
  let due = new Date(today.getFullYear(), today.getMonth(), dueDay)
  if (due <= today) due = new Date(today.getFullYear(), today.getMonth() + 1, dueDay)
  return differenceInCalendarDays(due, today)
}

function lastUpdatedLabel(recordedAt: string | null): string | null {
  if (!recordedAt) return null
  const days = differenceInCalendarDays(new Date(), parseISO(recordedAt))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

interface Props {
  account: Account
  balance: number | null
  delta: number | null
  lastSnapshotAt: string | null
  onTap: () => void
}

export function AccountCard({ account, balance, delta, lastSnapshotAt, onTap }: Props) {
  const gradient = CARD_GRADIENTS[account.type as keyof typeof CARD_GRADIENTS]
  const utilization = account.type === 'credit_card' && account.credit_limit_cents && balance !== null
    ? Math.round((balance / account.credit_limit_cents) * 100)
    : null
  const dueDays = account.type === 'credit_card' && account.due_day != null
    ? daysUntilDue(account.due_day)
    : null
  const dueSoon = dueDays !== null && dueDays <= 5
  const updatedLabel = lastUpdatedLabel(lastSnapshotAt)
  const hasActivity = delta !== null && delta !== 0
  const isDebt = account.type === 'credit_card'

  return (
    <button
      onClick={onTap}
      className="wallet-card w-full text-left"
      style={{ background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}
    >
      <div className="relative p-5 flex flex-col" style={{ minHeight: '160px' }}>
        {/* Top row: name + type */}
        <div className="flex items-start justify-between mb-auto">
          <p className="text-sm font-semibold text-white truncate mr-2 leading-snug">{account.name}</p>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70 flex-shrink-0 mt-0.5">
            {TYPE_LABEL[account.type]}
          </span>
        </div>

        {/* Balance */}
        <div className="mt-4">
          <p className="text-[11px] text-white/60 mb-0.5">
            {account.type === 'credit_card' ? 'Balance owed' : 'Current balance'}
          </p>
          <p className="text-3xl font-bold tabular-nums text-white leading-none">
            {balance !== null ? formatMoney(balance) : '—'}
          </p>
        </div>

        {/* Bottom row */}
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex-1 min-w-0">
            {account.type === 'credit_card' && utilization !== null && account.credit_limit_cents && balance !== null ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-white/60">{formatMoney(account.credit_limit_cents - balance)} available</span>
                  <span className={`text-[10px] font-semibold ${
                    utilization >= 80 ? 'text-red-200' : utilization >= 50 ? 'text-yellow-100' : 'text-white/80'
                  }`}>
                    {utilization}% used
                  </span>
                </div>
                <div className="h-1 bg-white/25 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(utilization, 100)}%`,
                      background: utilization >= 80 ? 'rgba(255,150,150,0.9)' : 'rgba(255,255,255,0.75)'
                    }}
                  />
                </div>
              </div>
            ) : updatedLabel ? (
              <p className="text-[11px] text-white/60">Updated {updatedLabel}</p>
            ) : null}
          </div>

          <div className="text-right flex-shrink-0">
            {dueDays !== null && (
              <p className={`text-xs font-semibold ${dueSoon ? 'text-red-200' : 'text-white/70'}`}>
                {dueDays === 0 ? 'Due today' : `Due in ${dueDays}d`}
              </p>
            )}
            {hasActivity && (
              <p className={`text-xs tabular-nums font-medium mt-0.5 ${
                isDebt
                  ? delta! > 0 ? 'text-red-200' : 'text-green-200'
                  : delta! > 0 ? 'text-green-200' : 'text-red-200'
              }`}>
                {delta! > 0 ? '+' : ''}{formatMoney(delta!)} this cycle
              </p>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
