import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../data/profile'
import { useUpdateDashboardWidget } from '../data/profile'
import { useAccounts } from '../data/accounts'
import { useLatestBalances, useCycleActivitySnapshots, computeActivity } from '../data/snapshots'
import { useSubscriptions, subsThisCycle } from '../data/subscriptions'
import { useGoals } from '../data/goals'
import { useCycleTransactionBuckets } from '../data/transactions'
import { BucketCard } from '../components/BucketCard'
import { Skeleton } from '../components/Skeleton'
import { Sheet } from '../components/Sheet'
import { currentCycleStart, cycleLabel, cycleEnd, todayISO } from '../lib/cycle'
import { BUCKETS, BUCKET_META, bucketTargetCents, bucketPct } from '../lib/buckets'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney } from '../lib/money'
import type { Bucket, DashboardWidget, DashboardWidgetType, Account } from '../lib/supabase'

// ─── Hero widget value computation ───────────────────────────────────────────

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
      let d = 0
      let found = false
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

// ─── Dashboard ────────────────────────────────────────────────────────────────

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

  const [showWidgetPicker, setShowWidgetPicker] = useState(false)

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

  // Bucket actuals: prefer transaction data, fall back to subscriptions
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

      {/* Hero widget */}
      {hasAccounts && (
        <div className="px-4 pt-5">
          <div className="card px-4 py-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted mb-0.5">{heroLabel}</p>
              <p className={`text-xl font-bold tabular-nums ${
                widget.type === 'total_debt'
                  ? 'text-danger'
                  : heroVal < 0 ? 'text-danger' : 'text-text'
              }`}>
                {heroVal >= 0 ? '' : '−'}{formatMoney(Math.abs(heroVal))}
              </p>
              {delta !== null && delta !== 0 && (
                <p className={`text-xs tabular-nums mt-0.5 ${
                  widget.type === 'total_debt'
                    ? delta > 0 ? 'text-danger' : 'text-success'
                    : delta > 0 ? 'text-success' : 'text-danger'
                }`}>
                  {delta > 0 ? '+' : ''}{formatMoney(delta)} this cycle
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {widget.type === 'net_worth' && (
                <div className="text-right">
                  <p className="text-xs text-muted mb-0.5">Total debt</p>
                  <p className="text-sm font-medium tabular-nums text-danger">{formatMoney(totalDebt)}</p>
                </div>
              )}
              <button
                onClick={() => setShowWidgetPicker(true)}
                aria-label="Customize hero widget"
                className="p-2 -mr-1 rounded-lg text-muted hover:text-subtle hover:bg-border/50 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
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
          <p className="text-xs text-muted mt-2">
            {usingTransactions
              ? 'Actuals from synced transactions this pay period.'
              : 'Actuals reflect subscriptions due this pay period.'}
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
                  <div className="h-1.5 bg-border/50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: pct >= 100 ? '#34c759' : '#007aff' }}
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

// ─── Widget Picker Sheet ──────────────────────────────────────────────────────

const GLOBAL_WIDGETS: Array<{ type: DashboardWidgetType; label: string; sublabel: string }> = [
  { type: 'net_worth',        label: 'Net worth',        sublabel: 'Assets minus liabilities' },
  { type: 'total_cash',       label: 'Total cash',       sublabel: 'Checking + savings' },
  { type: 'total_savings',    label: 'Total savings',    sublabel: 'Savings accounts only' },
  { type: 'total_investments', label: 'Total investments', sublabel: 'Investment accounts' },
  { type: 'total_debt',       label: 'Total debt',       sublabel: 'Credit card balances' },
]

function WidgetPickerSheet({
  current,
  accounts,
  balanceMap,
  onClose
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
      <div className="px-4 pb-4">
        <p className="text-xs text-muted mb-3 uppercase tracking-wider">Summary metrics</p>
        <div className="flex flex-col gap-1.5 mb-5">
          {GLOBAL_WIDGETS.map(w => (
            <button
              key={w.type}
              onClick={() => select({ type: w.type })}
              className={`card px-4 py-3 text-left flex items-center justify-between transition-colors ${
                isSelected({ type: w.type }) ? 'border-2 border-accent' : ''
              }`}
            >
              <div>
                <p className="text-sm font-medium text-text">{w.label}</p>
                <p className="text-xs text-muted mt-0.5">{w.sublabel}</p>
              </div>
              {isSelected({ type: w.type }) && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
        </div>

        {accounts.length > 0 && (
          <>
            <p className="text-xs text-muted mb-3 uppercase tracking-wider">Single account</p>
            <div className="flex flex-col gap-1.5">
              {accounts.map(a => {
                const meta     = ACCOUNT_TYPE_META[a.type]
                const balance  = balanceMap.get(a.id) ?? null
                const selected = isSelected({ type: 'account', account_id: a.id })
                return (
                  <button
                    key={a.id}
                    onClick={() => select({ type: 'account', account_id: a.id })}
                    className={`card px-4 py-3 text-left flex items-center justify-between transition-colors ${
                      selected ? 'border-2 border-accent' : ''
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-text">{a.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: meta.color }}>{meta.label}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {balance !== null && (
                        <span className="text-sm tabular-nums text-subtle">{formatMoney(balance)}</span>
                      )}
                      {selected && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
