import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../data/profile'
import { useUpdateDashboardWidget } from '../data/profile'
import { useAccounts } from '../data/accounts'
import { useLatestBalances, useCycleActivitySnapshots, computeActivity } from '../data/snapshots'
import { useSubscriptions, subsThisCycle } from '../data/subscriptions'
import { useGoals } from '../data/goals'
import { useCycleTransactionBuckets, useTransactions } from '../data/transactions'
import { BucketCard } from '../components/BucketCard'
import { BucketDetailSheet } from '../components/BucketDetailSheet'
import { Skeleton } from '../components/Skeleton'
import { Sheet } from '../components/Sheet'
import { currentCycleStart, cycleLabel, cycleEnd, todayISO } from '../lib/cycle'
import { BUCKETS, BUCKET_META, bucketTargetCents, bucketPct } from '../lib/buckets'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney } from '../lib/money'
import type { Bucket, DashboardWidget, DashboardWidgetType, Account } from '../lib/supabase'

function heroValue(
  widget: DashboardWidget,
  totalByType: Record<string, number>,
  balanceMap: Map<string, number>,
  accounts: Account[]
): { value: number; label: string } {
  switch (widget.type) {
    case 'net_worth': {
      const assets = ['checking', 'savings', 'investment'].reduce((s, t) => s + (totalByType[t] ?? 0), 0)
      const debt   = totalByType['credit_card'] ?? 0
      return { value: assets - debt, label: 'Net worth' }
    }
    case 'total_cash':
      return { value: (totalByType['checking'] ?? 0) + (totalByType['savings'] ?? 0), label: 'Total cash' }
    case 'total_savings':
      return { value: totalByType['savings'] ?? 0, label: 'Total savings' }
    case 'total_investments':
      return { value: totalByType['investment'] ?? 0, label: 'Total investments' }
    case 'total_debt':
      return { value: totalByType['credit_card'] ?? 0, label: 'Total debt' }
    case 'account': {
      const acct = accounts.find(a => a.id === widget.account_id)
      return {
        value: widget.account_id ? (balanceMap.get(widget.account_id) ?? 0) : 0,
        label: acct?.name ?? 'Account'
      }
    }
    default:
      return { value: 0, label: 'Net worth' }
  }
}

function heroDelta(
  widget: DashboardWidget,
  activityMap: Map<string, { baseline: number; current: number; delta: number }>,
  accounts: Account[]
): number | null {
  switch (widget.type) {
    case 'net_worth': {
      let d = 0; let found = false
      for (const a of accounts) {
        const act = activityMap.get(a.id)
        if (!act) continue
        found = true
        d += a.type === 'credit_card' ? -act.delta : act.delta
      }
      return found ? d : null
    }
    case 'total_cash': {
      let d = 0, found = false
      for (const a of accounts.filter(a => a.type === 'checking' || a.type === 'savings')) {
        const act = activityMap.get(a.id)
        if (act) { d += act.delta; found = true }
      }
      return found ? d : null
    }
    case 'total_savings': {
      let d = 0, found = false
      for (const a of accounts.filter(a => a.type === 'savings')) {
        const act = activityMap.get(a.id)
        if (act) { d += act.delta; found = true }
      }
      return found ? d : null
    }
    case 'total_investments': {
      let d = 0, found = false
      for (const a of accounts.filter(a => a.type === 'investment')) {
        const act = activityMap.get(a.id)
        if (act) { d += act.delta; found = true }
      }
      return found ? d : null
    }
    case 'total_debt': {
      let d = 0, found = false
      for (const a of accounts.filter(a => a.type === 'credit_card')) {
        const act = activityMap.get(a.id)
        if (act) { d += act.delta; found = true }
      }
      return found ? d : null
    }
    case 'account':
      return activityMap.get(widget.account_id ?? '')?.delta ?? null
    default:
      return null
  }
}

export function Dashboard() {
  const navigate = useNavigate()
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: accounts = [], isLoading: accountsLoading } = useAccounts()
  const { data: latestBalances = [] } = useLatestBalances()
  const { data: subs = [] } = useSubscriptions()
  const { data: goals = [] } = useGoals()

  const anchor     = profile?.cycle_anchor_date ?? todayISO()
  const cycleStart = currentCycleStart(anchor)
  const cycleEnd_  = cycleEnd(cycleStart)
  const { data: activitySnapshots = [] } = useCycleActivitySnapshots(cycleStart)

  const { data: txBuckets } = useCycleTransactionBuckets(
    format(cycleStart, 'yyyy-MM-dd'),
    format(cycleEnd_, 'yyyy-MM-dd')
  )

  const { data: allTransactions = [] } = useTransactions()

  const [showWidgetPicker, setShowWidgetPicker] = useState(false)
  const [detailBucket, setDetailBucket] = useState<Bucket | null>(null)

  const balanceMap  = new Map(latestBalances.map(s => [s.account_id, s.balance_cents]))
  const activityMap = computeActivity(activitySnapshots, cycleStart)

  const totalByType = ACCOUNT_TYPES.reduce((acc, type) => {
    acc[type] = accounts
      .filter(a => a.type === type)
      .reduce((sum, a) => sum + (balanceMap.get(a.id) ?? 0), 0)
    return acc
  }, {} as Record<string, number>)

  const totalDebt = totalByType['credit_card'] ?? 0

  const dueSubs = subsThisCycle(subs, cycleStart)

  const subscriptionActuals = BUCKETS.reduce((acc, b) => {
    acc[b] = dueSubs.filter(s => s.bucket === b).reduce((sum, s) => sum + s.amount_cents, 0)
    return acc
  }, {} as Record<Bucket, number>)

  const bucketActuals = txBuckets ?? subscriptionActuals
  const usingTransactions = Boolean(txBuckets)

  const netCreditDelta = accounts
    .filter(a => a.type === 'credit_card')
    .reduce((sum, a) => sum + (activityMap.get(a.id)?.delta ?? 0), 0)

  const widget: DashboardWidget = profile?.dashboard_widget ?? { type: 'net_worth' }
  const { value: heroVal, label: heroLabel } = heroValue(widget, totalByType, balanceMap, accounts)
  const delta = heroDelta(widget, activityMap, accounts)

  const hasProfile  = profile && profile.paycheck_cents > 0
  const hasAccounts = accounts.length > 0
  const hasSubs     = subs.length > 0
  const hasGoals    = goals.length > 0

  if (profileLoading) {
    return (
      <div className="pb-24 lg:pb-8 px-4 lg:px-6 pt-6 lg:pt-8">
        <Skeleton className="h-5 w-28 mb-1" />
        <Skeleton className="h-7 w-44 mb-6" />
        <Skeleton className="h-28 rounded-lg mb-3" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="pb-24 lg:pb-8">
      {/* Header */}
      <div className="px-4 lg:px-6 pt-6 lg:pt-8 pb-4 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-xs text-muted mb-0.5">Pay period</p>
          <h1 className="font-display text-xl lg:text-2xl font-semibold text-text">
            {cycleLabel(cycleStart)}
          </h1>
        </div>
        <button
          onClick={() => navigate('/history')}
          className="btn-ghost text-xs gap-1.5 py-2 px-3"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="12 8 12 12 14 14"/>
            <path d="M3.05 11a9 9 0 1 0 .5-4.5"/>
            <polyline points="3 3 3 9 9 9"/>
          </svg>
          History
        </button>
      </div>

      {/* Setup nudge */}
      {!hasProfile && (
        <div className="px-4 lg:px-6 pt-5">
          <button
            onClick={() => navigate('/settings')}
            className="w-full card px-4 py-4 flex items-center gap-3 text-left hover:bg-elev/50 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text">Set up your budget</p>
              <p className="text-xs text-muted mt-0.5">Add your paycheck in Settings to see your 50/30/20 breakdown.</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted flex-shrink-0">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}

      {/* Hero widget */}
      {hasAccounts && (
        <div className="px-4 lg:px-6 pt-5">
          <div className="card px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted mb-1">{heroLabel}</p>
              <p className={`font-mono text-3xl lg:text-4xl font-bold tabular-nums leading-none ${
                widget.type === 'total_debt'
                  ? 'text-danger'
                  : heroVal < 0 ? 'text-danger' : 'text-text'
              }`}>
                {heroVal >= 0 ? '' : '−'}{formatMoney(Math.abs(heroVal))}
              </p>
              {delta !== null && delta !== 0 && (
                <p className={`text-xs font-mono tabular-nums mt-1.5 ${
                  widget.type === 'total_debt'
                    ? delta > 0 ? 'text-danger' : 'text-success'
                    : delta > 0 ? 'text-success' : 'text-danger'
                }`}>
                  {delta > 0 ? '+' : ''}{formatMoney(delta)} this cycle
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              {widget.type === 'net_worth' && (
                <div className="text-right">
                  <p className="text-xs text-muted mb-0.5">Total debt</p>
                  <p className="font-mono text-sm font-semibold tabular-nums text-danger">{formatMoney(totalDebt)}</p>
                </div>
              )}
              <button
                onClick={() => setShowWidgetPicker(true)}
                aria-label="Customize hero widget"
                className="p-2 rounded-lg text-muted hover:text-text hover:bg-elev transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account type totals */}
      <div className="px-4 lg:px-6 pt-6">
        <p className="section-label mb-3">Balances</p>
        {accountsLoading ? (
          <div className="grid grid-cols-2 gap-2.5">
            {[0,1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : !hasAccounts ? (
          <button
            onClick={() => navigate('/accounts')}
            className="w-full card px-4 py-8 flex flex-col items-center justify-center gap-2 text-center hover:bg-elev/30 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-elev flex items-center justify-center mb-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-text">Add your first account</p>
            <p className="text-xs text-muted">Connect your bank via Plaid to start tracking</p>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {ACCOUNT_TYPES.map(type => {
              const meta = ACCOUNT_TYPE_META[type]
              const list = accounts.filter(a => a.type === type)
              const total = totalByType[type] ?? 0
              return (
                <div key={type} className="card px-3.5 py-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                    <p className="text-xs text-muted truncate">{meta.label}</p>
                  </div>
                  {list.length > 0 ? (
                    <>
                      <p className="font-mono text-base font-semibold tabular-nums" style={{ color: meta.color }}>
                        {formatMoney(total)}
                      </p>
                      {type === 'credit_card' && netCreditDelta !== 0 && (
                        <p className={`text-xs font-mono tabular-nums mt-0.5 ${netCreditDelta > 0 ? 'text-danger' : 'text-success'}`}>
                          {netCreditDelta > 0 ? '+' : ''}{formatMoney(netCreditDelta)}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted font-mono">—</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 50/30/20 buckets */}
      {hasProfile && (
        <div className="px-4 lg:px-6 pt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="section-label">Budget</p>
            <span className="text-xs font-mono text-muted tabular-nums">{formatMoney(profile.paycheck_cents)}/paycheck</span>
          </div>
          <div className="flex flex-col gap-2">
            {BUCKETS.map(b => (
              <BucketCard
                key={b}
                bucket={b}
                pct={bucketPct(profile, b)}
                targetCents={bucketTargetCents(profile, b)}
                actualCents={bucketActuals[b]}
                onClick={() => setDetailBucket(b)}
              />
            ))}
          </div>
          <p className="text-xs text-muted mt-2">
            {usingTransactions
              ? 'Actuals from synced transactions this pay period.'
              : 'Actuals reflect subscriptions due this pay period.'}
          </p>
        </div>
      )}

      {/* Top spending this cycle */}
      {(() => {
        const cycleStartStr = format(cycleStart, 'yyyy-MM-dd')
        const cycleEndStr   = format(cycleEnd_, 'yyyy-MM-dd')
        const topTx = allTransactions
          .filter(tx => !tx.is_income && tx.amount_cents > 0 && tx.date >= cycleStartStr && tx.date <= cycleEndStr)
          .sort((a, b) => b.amount_cents - a.amount_cents)
          .slice(0, 3)
        if (topTx.length === 0) return null
        return (
          <div className="px-4 lg:px-6 pt-6">
            <p className="section-label mb-3">Top spending this cycle</p>
            <div className="card px-4 py-0">
              {topTx.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 py-3.5 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text truncate">{tx.merchant_name || tx.description}</p>
                    <p className="text-xs text-muted mt-0.5">{format(new Date(tx.date + 'T00:00:00'), 'MMM d')}</p>
                  </div>
                  <span className="font-mono text-sm tabular-nums text-danger font-medium flex-shrink-0">
                    {formatMoney(tx.amount_cents)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Subscriptions due this cycle */}
      {dueSubs.length > 0 && (
        <div className="px-4 lg:px-6 pt-6">
          <p className="section-label mb-3">Due this period</p>
          <div className="card px-4 py-0">
            {dueSubs.map(s => {
              const bucketMeta = BUCKET_META[s.bucket]
              return (
                <div key={s.id} className="flex items-center gap-3 py-3.5 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text">{s.name}</p>
                    <p className="text-xs text-muted mt-0.5">
                      <span className="font-mono tabular-nums">{format(parseISO(s.next_charge_on), 'MMM d')}</span>
                      <span className="mx-1.5">·</span>
                      <span style={{ color: bucketMeta.color }}>{bucketMeta.label}</span>
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums text-text flex-shrink-0">
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
        <div className="px-4 lg:px-6 pt-6">
          <button
            onClick={() => navigate('/subscriptions')}
            className="w-full card px-4 py-4 flex items-center gap-3 text-left hover:bg-elev/30 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text">Track subscriptions</p>
              <p className="text-xs text-muted mt-0.5">Import transactions to auto-detect recurring charges</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted flex-shrink-0">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}

      {/* Goals preview */}
      {hasGoals && (
        <div className="px-4 lg:px-6 pt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="section-label">Goals</p>
            <button onClick={() => navigate('/goals')} className="text-xs text-accent font-medium hover:text-accent/80 transition-colors px-1 py-2 -mr-1">
              See all →
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            {goals.slice(0, 3).map(goal => {
              const currentCents = goal.linked_account_id
                ? (balanceMap.get(goal.linked_account_id) ?? 0)
                : goal.current_cents
              const pct = goal.target_cents > 0
                ? Math.min(Math.round(currentCents / goal.target_cents * 100), 100)
                : 0
              const isComplete = pct >= 100
              return (
                <div key={goal.id} className="card px-4 py-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-text">{goal.name}</p>
                    <span className={`text-xs font-mono tabular-nums font-medium ${isComplete ? 'text-success' : 'text-muted'}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-elev rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: isComplete ? '#16A34A' : '#3B82F6' }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs font-mono tabular-nums text-muted">{formatMoney(currentCents)}</span>
                    <span className="text-xs font-mono tabular-nums text-muted">{formatMoney(goal.target_cents)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Goals empty CTA */}
      {!hasGoals && hasAccounts && (
        <div className="px-4 lg:px-6 pt-6">
          <button
            onClick={() => navigate('/goals')}
            className="w-full card px-4 py-4 flex items-center gap-3 text-left hover:bg-elev/30 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text">Set a savings goal</p>
              <p className="text-xs text-muted mt-0.5">Track progress towards any financial target</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted flex-shrink-0">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}

      {detailBucket && (
        <BucketDetailSheet
          bucket={detailBucket}
          cycleStart={cycleStart}
          cycleEnd={cycleEnd_}
          subscriptions={subs}
          onClose={() => setDetailBucket(null)}
        />
      )}

      {showWidgetPicker && (
        <WidgetPickerSheet
          current={widget}
          accounts={accounts}
          balanceMap={balanceMap}
          onClose={() => setShowWidgetPicker(false)}
        />
      )}
    </div>
  )
}

const GLOBAL_WIDGETS: Array<{ type: DashboardWidgetType; label: string; sublabel: string }> = [
  { type: 'net_worth',         label: 'Net worth',         sublabel: 'Assets minus liabilities' },
  { type: 'total_cash',        label: 'Total cash',        sublabel: 'Checking + savings' },
  { type: 'total_savings',     label: 'Total savings',     sublabel: 'Savings accounts only' },
  { type: 'total_investments', label: 'Total investments', sublabel: 'Investment accounts' },
  { type: 'total_debt',        label: 'Total debt',        sublabel: 'Credit card balances' },
]

function WidgetPickerSheet({
  current, accounts, balanceMap, onClose
}: {
  current: DashboardWidget
  accounts: Account[]
  balanceMap: Map<string, number>
  onClose: () => void
}) {
  const updateWidget = useUpdateDashboardWidget()

  async function select(widget: DashboardWidget) {
    await updateWidget.mutateAsync(widget)
    onClose()
  }

  function isSelected(w: DashboardWidget) {
    if (w.type !== current.type) return false
    if (w.type === 'account') return w.account_id === current.account_id
    return true
  }

  return (
    <Sheet onClose={onClose} title="Customize dashboard" maxHeight="80vh">
      <div className="px-5 pb-5">
        <p className="section-label mb-3">Summary metrics</p>
        <div className="flex flex-col gap-1.5 mb-5">
          {GLOBAL_WIDGETS.map(w => (
            <button
              key={w.type}
              onClick={() => select({ type: w.type })}
              className={`card px-4 py-3 text-left flex items-center justify-between transition-colors hover:bg-elev/40 ${
                isSelected({ type: w.type }) ? 'border-accent border-2' : ''
              }`}
            >
              <div>
                <p className="text-sm font-medium text-text">{w.label}</p>
                <p className="text-xs text-muted mt-0.5">{w.sublabel}</p>
              </div>
              {isSelected({ type: w.type }) && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
        </div>

        {accounts.length > 0 && (
          <>
            <p className="section-label mb-3">Single account</p>
            <div className="flex flex-col gap-1.5">
              {accounts.map(a => {
                const meta     = ACCOUNT_TYPE_META[a.type]
                const balance  = balanceMap.get(a.id) ?? null
                const selected = isSelected({ type: 'account', account_id: a.id })
                return (
                  <button
                    key={a.id}
                    onClick={() => select({ type: 'account', account_id: a.id })}
                    className={`card px-4 py-3 text-left flex items-center justify-between transition-colors hover:bg-elev/40 ${
                      selected ? 'border-accent border-2' : ''
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-text">{a.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: meta.color }}>{meta.label}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {balance !== null && (
                        <span className="font-mono text-sm tabular-nums text-muted">{formatMoney(balance)}</span>
                      )}
                      {selected && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
