import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { AccountType, BalanceSnapshot } from '../lib/supabase'
import { cycleEnd } from '../lib/cycle'

// Latest balance per account: fetch all snapshots ordered desc, dedupe by account_id
export function useLatestBalances() {
  return useQuery({
    queryKey: ['snapshots', 'latest'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_balance_snapshots')
        .select('*')
        .order('recorded_at', { ascending: false })
      if (error) throw error
      const seen = new Set<string>()
      const latest: BalanceSnapshot[] = []
      for (const row of (data as BalanceSnapshot[])) {
        if (!seen.has(row.account_id)) {
          seen.add(row.account_id)
          latest.push(row)
        }
      }
      return latest
    }
  })
}

// Snapshots in a 30-day window ending at cycle end — gives us the pre-cycle baseline
// plus all in-cycle updates for activity computation.
export function useCycleActivitySnapshots(cycleStart: Date) {
  const end = cycleEnd(cycleStart)
  const windowStart = format(addDays(cycleStart, -16), "yyyy-MM-dd'T'00:00:00+00:00")
  const windowEnd   = format(addDays(end, 1),          "yyyy-MM-dd'T'23:59:59+00:00")
  return useQuery({
    queryKey: ['snapshots', 'activity', format(cycleStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_balance_snapshots')
        .select('*')
        .gte('recorded_at', windowStart)
        .lte('recorded_at', windowEnd)
        .order('recorded_at', { ascending: true })
      if (error) throw error
      return data as BalanceSnapshot[]
    }
  })
}

// Derive per-account activity from snapshot window.
// baseline = last snapshot strictly before cycleStart
// current  = latest snapshot in cycle
// delta    = current - baseline (positive = more owed/spent, negative = paid down)
export function computeActivity(
  snapshots: BalanceSnapshot[],
  cycleStart: Date
): Map<string, { baseline: number; current: number; delta: number }> {
  const cycleStartMs = cycleStart.getTime()
  const byAccount = new Map<string, BalanceSnapshot[]>()
  for (const s of snapshots) {
    const arr = byAccount.get(s.account_id) ?? []
    arr.push(s)
    byAccount.set(s.account_id, arr)
  }
  const result = new Map<string, { baseline: number; current: number; delta: number }>()
  for (const [accountId, snaps] of byAccount) {
    const sorted = snaps.slice().sort((a, b) =>
      new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
    )
    const preCycle = sorted.filter(s => new Date(s.recorded_at).getTime() < cycleStartMs)
    const inCycle  = sorted.filter(s => new Date(s.recorded_at).getTime() >= cycleStartMs)
    const baseline = preCycle.length > 0 ? preCycle[preCycle.length - 1].balance_cents
                   : inCycle.length  > 0 ? inCycle[0].balance_cents
                   : null
    const current  = inCycle.length > 0  ? inCycle[inCycle.length - 1].balance_cents
                   : preCycle.length > 0 ? preCycle[preCycle.length - 1].balance_cents
                   : null
    if (baseline !== null && current !== null) {
      result.set(accountId, { baseline, current, delta: current - baseline })
    }
  }
  return result
}

export function useUpdateBalance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      account_id,
      balance_cents,
      account_type
    }: {
      account_id: string
      balance_cents: number
      account_type: AccountType
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('account_balance_snapshots')
        .insert({ account_id, user_id: user.id, balance_cents })
        .select()
        .single()
      if (error) throw error
      const newSnapshot = data as BalanceSnapshot

      if (account_type === 'savings') {
        const { data: recent } = await supabase
          .from('account_balance_snapshots')
          .select('balance_cents')
          .eq('account_id', account_id)
          .order('recorded_at', { ascending: false })
          .limit(2)

        if (recent && recent.length === 2) {
          const delta = recent[0].balance_cents - recent[1].balance_cents
          if (delta > 0) {
            const { data: linkedGoal } = await supabase
              .from('goals')
              .select('id')
              .eq('linked_account_id', account_id)
              .eq('user_id', user.id)
              .maybeSingle()

            if (linkedGoal) {
              await supabase.from('goal_contributions').insert({
                goal_id: linkedGoal.id,
                user_id: user.id,
                amount_cents: delta,
                occurred_on: format(new Date(), 'yyyy-MM-dd'),
                source: 'auto',
                snapshot_id: newSnapshot.id
              })
              qc.invalidateQueries({ queryKey: ['contributions', linkedGoal.id] })
            }
          }
        }
      }

      return newSnapshot
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snapshots'] })
  })
}
