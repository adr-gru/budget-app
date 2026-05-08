import { format, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../data/profile'
import { useAccounts } from '../data/accounts'
import { useLatestBalances, useCycleActivitySnapshots, computeActivity } from '../data/snapshots'
import { useSubscriptions, subsThisCycle } from '../data/subscriptions'
import { useGoals } from '../data/goals'
import { BucketCard } from '../components/BucketCard'
import { Skeleton } from '../components/Skeleton'
import { currentCycleStart, cycleLabel, todayISO } from '../lib/cycle'
import { BUCKETS, BUCKET_META, bucketTargetCents, bucketPct } from '../lib/buckets'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney } from '../lib/money'
import type { Bucket } from '../lib/supabase'

export function Dashboard() {
  const navigate = useNavigate()
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: accounts = [], isLoading: accountsLoading } = useAccounts()
  const { data: latestBalances = [] } = useLatestBalances()
  const { data: subs = [] } = useSubscriptions()
  const { data: goals = [] } = useGoals()

  const anchor = profile?.cycle_anchor_date ?? todayISO()
  const cycleStart = currentCycleStart(anchor)
  const { data: activitySnapshots = [] } = useCycleActivitySnapshots(cycleStart)

  const balanceMap  = new Map(latestBalances.map(s => [s.account_id, s.balance_cents]))
  const activityMap = computeActivity(activitySnapshots, cycleStart)

  const totalByType = ACCOUNT_TYPES.reduce((acc, type) => {
    acc[type] = accounts
      .filter(a => a.type === type)
      .reduce((sum, a) => sum + (balanceMap.get(a.id) ?? 0), 0)
    return acc
  }, {} as Record<string, number>)

  const totalAssets = ['checking', 'savings', 'investment'].reduce((s, t) => s + (totalByType[t] ?? 0), 0)
  const totalDebt   = totalByType['credit_card'] ?? 0
  const netWorth    = totalAssets - totalDebt

  const dueSubs = subsThisCycle(subs, cycleStart)

  const bucketActuals = BUCKETS.reduce((acc, b) => {
    acc[b] = dueSubs.filter(s => s.bucket === b).reduce((sum, s) => sum + s.amount_cents, 0)
    return acc
  }, {} as Record<Bucket, number>)

  const netCreditDelta = accounts
    .filter(a => a.type === 'credit_card')
    .reduce((sum, a) => sum + (activityMap.get(a.id)?.delta ?? 0), 0)

  const hasProfile  = profile && profile.paycheck_cents > 0
  const hasAccounts = accounts.length > 0
  const hasSubs     = subs.length > 0
  const hasGoals    = goals.length > 0

  if (profileLoading) {
    return (
      <div className="pb-24 px-4 pt-12">
        <Skeleton className="h-4 w-24 mb-1" />
        <Skeleton className="h-6 w-40 mb-6" />
        <Skeleton className="h-24 rounded-lg mb-3" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-xs text-muted mb-0.5">Pay period</p>
          <h1 className="text-lg font-semibold text-text">{cycleLabel(cycleStart)}</h1>
        </div>
        <button
          onClick={() => navigate('/history')}
          className="btn-ghost text-xs gap-1.5 py-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="12 8 12 12 14 14"/>
            <path d="M3.05 11a9 9 0 1 0 .5-4.5"/>
            <polyline points="3 3 3 9 9 9"/>
          </svg>
          History
        </button>
      </div>

      {/* Setup nudge */}
      {!hasProfile && (
        <div className="px-4 pt-4">
          <button
            onClick={() => navigate('/settings')}
            className="w-full card px-4 py-3.5 flex items-center gap-3 text-left"
          >
            <div className="flex-1">
              <p className="text-sm text-text font-medium mb-0.5">Set up your budget</p>
              <p className="text-xs text-muted">Add your paycheck in Settings to see your 50/30/20 breakdown.</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted flex-shrink-0">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}

      {/* Net worth */}
      {hasAccounts && (
        <div className="px-4 pt-5">
          <div className="card px-4 py-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted mb-0.5">Net worth</p>
              <p className={`text-xl font-bold tabular-nums ${netWorth >= 0 ? 'text-text' : 'text-danger'}`}>
                {netWorth >= 0 ? '' : '−'}{formatMoney(Math.abs(netWorth))}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted mb-0.5">Total debt</p>
              <p className="text-sm font-medium tabular-nums text-danger">{formatMoney(totalDebt)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Account type totals */}
      <div className="px-4 pt-5">
        <p className="text-xs text-muted mb-3 uppercase tracking-wider">Balances</p>
        {accountsLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {[0,1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : !hasAccounts ? (
          <button
            onClick={() => navigate('/accounts')}
            className="w-full card px-4 py-3.5 flex items-center justify-between text-left"
          >
            <p className="text-sm text-subtle">Add your first account</p>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {ACCOUNT_TYPES.map(type => {
              const meta = ACCOUNT_TYPE_META[type]
              const list = accounts.filter(a => a.type === type)
              const total = totalByType[type] ?? 0
              return (
                <div key={type} className="card px-3 py-3">
                  <p className="text-xs text-muted mb-1">{meta.label}</p>
                  {list.length > 0 ? (
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
        )}
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
          <p className="text-xs text-muted mt-2">Actuals reflect subscriptions due this pay period.</p>
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

      {/* Subscriptions empty CTA */}
      {!hasSubs && hasAccounts && (
        <div className="px-4 pt-5">
          <button
            onClick={() => navigate('/subscriptions')}
            className="w-full card px-4 py-3.5 flex items-center justify-between text-left"
          >
            <p className="text-sm text-subtle">Track your recurring subscriptions</p>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}

      {/* Goals preview */}
      {hasGoals && (
        <div className="px-4 pt-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted uppercase tracking-wider">Goals</p>
            <button onClick={() => navigate('/goals')} className="text-xs text-accent">
              Manage →
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {goals.slice(0, 3).map(goal => {
              const currentCents = goal.linked_account_id
                ? (balanceMap.get(goal.linked_account_id) ?? 0)
                : goal.current_cents
              const pct = goal.target_cents > 0
                ? Math.min(Math.round(currentCents / goal.target_cents * 100), 100)
                : 0
              return (
                <div key={goal.id} className="card px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium text-text">{goal.name}</p>
                    <span className="text-xs tabular-nums text-subtle">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-elev rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: pct >= 100 ? '#34d399' : '#a78bfa' }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs text-muted">{formatMoney(currentCents)}</span>
                    <span className="text-xs text-muted">{formatMoney(goal.target_cents)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Goals empty CTA */}
      {!hasGoals && hasAccounts && (
        <div className="px-4 pt-5">
          <button
            onClick={() => navigate('/goals')}
            className="w-full card px-4 py-3.5 flex items-center justify-between text-left"
          >
            <p className="text-sm text-subtle">Set a savings goal</p>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
