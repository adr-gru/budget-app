import { useState } from 'react'
import { addDays, format, subDays } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useProfile } from '../data/profile'
import { useAccounts } from '../data/accounts'
import { computeActivity } from '../data/snapshots'
import type { Account, BalanceSnapshot } from '../lib/supabase'
import { currentCycleStart, cycleEnd, cycleLabel, cycleKey, prevCycle, todayISO } from '../lib/cycle'
import { ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney } from '../lib/money'
import { Skeleton } from '../components/Skeleton'
import { NetWorthChart } from '../components/NetWorthChart'

const CYCLES_TO_SHOW = 10

function usePastSnapshots(anchor: string) {
  const cycleStart = currentCycleStart(anchor)
  const oldest = subDays(cycleStart, (CYCLES_TO_SHOW + 1) * 14 + 16)
  const startStr = format(oldest, "yyyy-MM-dd'T'00:00:00+00:00")
  return useQuery({
    queryKey: ['snapshots', 'history-all', cycleKey(cycleStart)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_balance_snapshots')
        .select('*')
        .gte('recorded_at', startStr)
        .order('recorded_at', { ascending: true })
      if (error) throw error
      return data as BalanceSnapshot[]
    }
  })
}

function computeNetWorthAtCycleEnd(
  allSnapshots: BalanceSnapshot[],
  accounts: Account[],
  cycleStart: Date
): number {
  const end = cycleEnd(cycleStart)
  const endMs = end.getTime()

  return accounts.reduce((sum, account) => {
    const acctSnaps = allSnapshots
      .filter(s => s.account_id === account.id && new Date(s.recorded_at).getTime() <= endMs)
    if (acctSnaps.length === 0) return sum
    const latest = acctSnaps[acctSnaps.length - 1]
    const meta = ACCOUNT_TYPE_META[account.type]
    return sum + (meta.isDebt ? -latest.balance_cents : latest.balance_cents)
  }, 0)
}

export function History() {
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const anchor = profile?.cycle_anchor_date ?? todayISO()
  const { data: allSnapshots = [], isLoading } = usePastSnapshots(anchor)

  const [expanded, setExpanded] = useState<string | null>(null)

  const currentStart = currentCycleStart(anchor)
  const pastCycles: Date[] = []
  let cs = prevCycle(currentStart)
  for (let i = 0; i < CYCLES_TO_SHOW; i++) {
    pastCycles.push(cs)
    cs = prevCycle(cs)
  }

  function toggle(key: string) {
    setExpanded(prev => prev === key ? null : key)
  }

  const chartDataPoints = [...pastCycles]
    .reverse()
    .map(cycleStart => ({
      label: cycleLabel(cycleStart),
      netWorth: computeNetWorthAtCycleEnd(allSnapshots, accounts, cycleStart)
    }))

  const nonZeroCount = chartDataPoints.filter(d => d.netWorth !== 0).length
  const showChart = !isLoading && nonZeroCount >= 2

  return (
    <div className="pb-24 lg:pb-8">
      <div className="px-4 lg:px-6 pt-6 lg:pt-8 pb-4 border-b border-border">
        <h1 className="page-title">History</h1>
        <p className="text-xs text-muted mt-0.5">Past {CYCLES_TO_SHOW} pay periods</p>
      </div>

      {showChart && (
        <div className="px-4 lg:px-6 pt-6">
          <p className="section-label mb-3">Net worth trend</p>
          <NetWorthChart dataPoints={chartDataPoints} />
        </div>
      )}

      {isLoading ? (
        <div className="px-4 lg:px-6 pt-4 flex flex-col gap-0">
          {[0,1,2,3,4].map(i => (
            <div key={i} className="py-4 border-b border-border">
              <Skeleton className="h-4 w-36 mb-1.5" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
      ) : (
        pastCycles.map(cycleStart => {
          const end = cycleEnd(cycleStart)
          const key = cycleKey(cycleStart)
          const isExpanded = expanded === key

          const windowStart = subDays(cycleStart, 16)
          const windowSnaps = allSnapshots.filter(s => {
            const t = new Date(s.recorded_at)
            return t >= windowStart && t <= addDays(end, 1)
          })
          const activityMap = computeActivity(windowSnaps, cycleStart)

          const typeActivity = (['credit_card', 'checking', 'savings', 'investment'] as const).reduce((acc, type) => {
            const typeAccounts = accounts.filter(a => a.type === type)
            const delta = typeAccounts.reduce((sum, a) => sum + (activityMap.get(a.id)?.delta ?? 0), 0)
            if (delta !== 0) acc.push({ type, delta })
            return acc
          }, [] as { type: string; delta: number }[])

          const netDelta = accounts.reduce((sum, a) => {
            const act = activityMap.get(a.id)
            if (!act) return sum
            const meta = ACCOUNT_TYPE_META[a.type]
            return sum + (meta.isDebt ? -act.delta : act.delta)
          }, 0)

          const hasData = activityMap.size > 0

          return (
            <div key={key} className="border-b border-border">
              <button
                onClick={() => toggle(key)}
                className="w-full flex items-center justify-between px-4 lg:px-6 py-4 hover:bg-elev/30 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-text">{cycleLabel(cycleStart)}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className={`font-mono text-xs tabular-nums ${netDelta > 0 ? 'text-success' : 'text-danger'}`}>
                      Net: {netDelta > 0 ? '+' : ''}{formatMoney(netDelta)}
                    </span>
                    {hasData && !isExpanded && typeActivity.map(({ type, delta }) => {
                      const meta = ACCOUNT_TYPE_META[type as keyof typeof ACCOUNT_TYPE_META]
                      return (
                        <span key={type} className={`font-mono text-xs tabular-nums ${
                          meta.isDebt
                            ? delta > 0 ? 'text-danger' : 'text-success'
                            : delta > 0 ? 'text-success' : 'text-danger'
                        }`}>
                          {meta.label}: {delta > 0 ? '+' : ''}{formatMoney(delta)}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={`text-muted transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {isExpanded && (
                <div className="px-4 lg:px-6 pb-4">
                  {!hasData ? (
                    <p className="text-xs text-muted py-2">No balance updates recorded this period.</p>
                  ) : (
                    <div className="card px-4 py-0">
                      {accounts
                        .filter(a => activityMap.has(a.id))
                        .map((a, idx, arr) => {
                          const act  = activityMap.get(a.id)!
                          const meta = ACCOUNT_TYPE_META[a.type]
                          return (
                            <div
                              key={a.id}
                              className={`flex items-center justify-between py-3 ${idx < arr.length - 1 ? 'border-b border-border' : ''}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                                <span className="text-sm text-subtle">{a.name}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-mono text-sm tabular-nums text-text">{formatMoney(act.current)}</span>
                                {act.delta !== 0 && (
                                  <span className={`font-mono text-xs tabular-nums ml-2 ${
                                    meta.isDebt
                                      ? act.delta > 0 ? 'text-danger' : 'text-success'
                                      : act.delta > 0 ? 'text-success' : 'text-danger'
                                  }`}>
                                    {act.delta > 0 ? '+' : ''}{formatMoney(act.delta)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })
                      }
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
