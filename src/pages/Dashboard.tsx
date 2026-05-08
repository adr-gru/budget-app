import { format, parseISO } from 'date-fns'
import { useProfile } from '../data/profile'
import { useAccounts } from '../data/accounts'
import { useLatestBalances, useCycleActivitySnapshots, computeActivity } from '../data/snapshots'
import { useSubscriptions, subsThisCycle } from '../data/subscriptions'
import { BucketCard } from '../components/BucketCard'
import { currentCycleStart, cycleLabel, todayISO } from '../lib/cycle'
import { BUCKETS, BUCKET_META, bucketTargetCents, bucketPct } from '../lib/buckets'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney } from '../lib/money'
import type { Bucket } from '../lib/supabase'

export function Dashboard() {
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: latestBalances = [] } = useLatestBalances()
  const { data: subs = [] } = useSubscriptions()

  const anchor = profile?.cycle_anchor_date ?? todayISO()
  const cycleStart = currentCycleStart(anchor)
  const { data: activitySnapshots = [] } = useCycleActivitySnapshots(cycleStart)

  const balanceMap = new Map(latestBalances.map(s => [s.account_id, s.balance_cents]))
  const activityMap = computeActivity(activitySnapshots, cycleStart)

  const totalByType = ACCOUNT_TYPES.reduce((acc, type) => {
    acc[type] = accounts
      .filter(a => a.type === type)
      .reduce((sum, a) => sum + (balanceMap.get(a.id) ?? 0), 0)
    return acc
  }, {} as Record<string, number>)

  const dueSubs = subsThisCycle(subs, cycleStart)

  const bucketActuals = BUCKETS.reduce((acc, b) => {
    acc[b] = dueSubs
      .filter(s => s.bucket === b)
      .reduce((sum, s) => sum + s.amount_cents, 0)
    return acc
  }, {} as Record<Bucket, number>)

  const netCreditDelta = accounts
    .filter(a => a.type === 'credit_card')
    .reduce((sum, a) => sum + (activityMap.get(a.id)?.delta ?? 0), 0)

  const hasProfile = profile && profile.paycheck_cents > 0

  return (
    <div className="pb-24">
      <div className="px-4 pt-12 pb-4 border-b border-border">
        <p className="text-xs text-muted mb-0.5">Pay period</p>
        <h1 className="text-lg font-semibold text-text">{cycleLabel(cycleStart)}</h1>
      </div>

      {!hasProfile && (
        <div className="px-4 pt-4">
          <div className="card px-4 py-3.5 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm text-text font-medium mb-0.5">Set up your budget</p>
              <p className="text-xs text-muted">Add your paycheck amount in Settings to see your 50/30/20 breakdown.</p>
            </div>
          </div>
        </div>
      )}

      {/* Account type totals */}
      <div className="px-4 pt-5">
        <p className="text-xs text-muted mb-3 uppercase tracking-wider">Balances</p>
        <div className="grid grid-cols-2 gap-2">
          {ACCOUNT_TYPES.map(type => {
            const meta = ACCOUNT_TYPE_META[type]
            const accountsOfType = accounts.filter(a => a.type === type)
            const total = totalByType[type] ?? 0
            return (
              <div key={type} className="card px-3 py-3">
                <p className="text-xs text-muted mb-1">{meta.label}</p>
                {accountsOfType.length > 0 ? (
                  <>
                    <p className="text-base font-semibold tabular-nums" style={{ color: meta.color }}>
                      {formatMoney(total)}
                    </p>
                    {type === 'credit_card' && netCreditDelta !== 0 && (
                      <p className={`text-xs tabular-nums mt-0.5 ${netCreditDelta > 0 ? 'text-danger' : 'text-success'}`}>
                        {netCreditDelta > 0 ? '+' : ''}{formatMoney(netCreditDelta)} this cycle
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted">—</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 50/30/20 buckets */}
      {hasProfile && (
        <div className="px-4 pt-5">
          <p className="text-xs text-muted mb-3 uppercase tracking-wider">
            Budget — {formatMoney(profile.paycheck_cents)} paycheck
          </p>
          <div className="flex flex-col gap-2">
            {BUCKETS.map(b => (
              <BucketCard
                key={b}
                bucket={b}
                pct={bucketPct(profile, b)}
                targetCents={bucketTargetCents(profile, b)}
                actualCents={bucketActuals[b]}
              />
            ))}
          </div>
          <p className="text-xs text-muted mt-2 pb-1">
            Actuals reflect subscriptions due this pay period.
          </p>
        </div>
      )}

      {/* Subscriptions due this cycle */}
      {dueSubs.length > 0 && (
        <div className="px-4 pt-5">
          <p className="text-xs text-muted mb-3 uppercase tracking-wider">Due this period</p>
          <div className="card px-4 py-0">
            {dueSubs.map(s => {
              const bucketMeta = BUCKET_META[s.bucket]
              return (
                <div key={s.id} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text">{s.name}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {format(parseISO(s.next_charge_on), 'MMM d')}
                      <span className="mx-1.5">·</span>
                      <span style={{ color: bucketMeta.color }}>{bucketMeta.label}</span>
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-text flex-shrink-0">
                    {formatMoney(s.amount_cents)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
