import { useState } from 'react'
import { addDays, format, subDays } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useProfile } from '../data/profile'
import { useAccounts } from '../data/accounts'
import { computeActivity } from '../data/snapshots'
import type { BalanceSnapshot } from '../lib/supabase'
import { currentCycleStart, cycleEnd, cycleLabel, cycleKey, prevCycle, todayISO } from '../lib/cycle'
import { ACCOUNT_TYPE_META } from '../lib/accountTypes'
import { formatMoney } from '../lib/money'

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

export function History() {
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const anchor = profile?.cycle_anchor_date ?? todayISO()
  const { data: allSnapshots = [], isLoading } = usePastSnapshots(anchor)

  const [expanded, setExpanded] = useState<string | null>(null)

  // Build list of past cycles (not including current)
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

  return (
    <div className="pb-24">
      <div className="px-4 pt-12 pb-4 border-b border-border">
        <h1 className="text-lg font-semibold text-text">History</h1>
        <p className="text-xs text-muted mt-0.5">Past {CYCLES_TO_SHOW} pay periods</p>
      </div>

      {isLoading && (
        <div className="py-12 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full border-2 border-border border-t-subtle animate-spin" />
        </div>
      )}

      {!isLoading && pastCycles.map(cycleStart => {
        const end = cycleEnd(cycleStart)
        const key = cycleKey(cycleStart)
        const isExpanded = expanded === key

        // Compute activity for this cycle
        const windowStart = subDays(cycleStart, 16)
        const windowSnaps = allSnapshots.filter(s => {
          const t = new Date(s.recorded_at)
          return t >= windowStart && t <= addDays(end, 1)
        })
        const activityMap = computeActivity(windowSnaps, cycleStart)

        // Totals per account type
        const typeActivity = (['credit_card', 'checking', 'savings', 'investment'] as const).reduce((acc, type) => {
          const typeAccounts = accounts.filter(a => a.type === type)
          const delta = typeAccounts.reduce((sum, a) => sum + (activityMap.get(a.id)?.delta ?? 0), 0)
          if (delta !== 0) acc.push({ type, delta })
          return acc
        }, [] as { type: string; delta: number }[])

        const hasData = activityMap.size > 0

        return (
          <div key={key} className="border-b border-border">
            <button
              onClick={() => toggle(key)}
              className="w-full flex items-center justify-between px-4 py-3.5 transition-colors"
            >
              <div className="text-left">
                <p className="text-sm font-medium text-text">{cycleLabel(cycleStart)}</p>
                {!hasData && <p className="text-xs text-muted mt-0.5">No balance updates</p>}
                {hasData && !isExpanded && (
                  <div className="flex items-center gap-3 mt-0.5">
                    {typeActivity.map(({ type, delta }) => {
                      const meta = ACCOUNT_TYPE_META[type as keyof typeof ACCOUNT_TYPE_META]
                      const isDebt = meta.isDebt
                      return (
                        <span key={type} className={`text-xs tabular-nums ${
                          isDebt
                            ? delta > 0 ? 'text-danger' : 'text-success'
                            : delta > 0 ? 'text-success' : 'text-danger'
                        }`}>
                          {meta.label}: {delta > 0 ? '+' : ''}{formatMoney(delta)}
                        </span>
                      )
                    })}
                  </div>
                )}
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
              <div className="px-4 pb-3">
                {!hasData ? (
                  <p className="text-xs text-muted py-2">No balance updates recorded this period.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {accounts
                      .filter(a => activityMap.has(a.id))
                      .map(a => {
                        const act = activityMap.get(a.id)!
                        const meta = ACCOUNT_TYPE_META[a.type]
                        return (
                          <div key={a.id} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                              <span className="text-sm text-subtle">{a.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm tabular-nums text-text">{formatMoney(act.current)}</span>
                              {act.delta !== 0 && (
                                <span className={`text-xs tabular-nums ml-2 ${
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
      })}
    </div>
  )
}
