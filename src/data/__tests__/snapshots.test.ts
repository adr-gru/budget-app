import { describe, it, expect } from 'vitest'
import { computeActivity } from '../snapshots'
import type { BalanceSnapshot } from '../../lib/supabase'

function snap(account_id: string, recorded_at: string, balance_cents: number): BalanceSnapshot {
  return { id: account_id + recorded_at, user_id: 'user', account_id, recorded_at, balance_cents }
}

const cycleStart = new Date('2024-06-01T00:00:00.000Z')

describe('computeActivity', () => {
  it('returns empty map when no snapshots', () => {
    expect(computeActivity([], cycleStart).size).toBe(0)
  })

  it('computes delta from baseline (pre-cycle) to current (in-cycle)', () => {
    const snapshots = [
      snap('a1', '2024-05-30T00:00:00.000Z', 10000), // baseline
      snap('a1', '2024-06-10T00:00:00.000Z', 12000), // current
    ]
    const result = computeActivity(snapshots, cycleStart)
    expect(result.get('a1')).toEqual({ baseline: 10000, current: 12000, delta: 2000 })
  })

  it('uses first in-cycle snapshot as baseline when no pre-cycle data', () => {
    const snapshots = [
      snap('a1', '2024-06-05T00:00:00.000Z', 5000),
      snap('a1', '2024-06-12T00:00:00.000Z', 7000),
    ]
    const result = computeActivity(snapshots, cycleStart)
    expect(result.get('a1')).toEqual({ baseline: 5000, current: 7000, delta: 2000 })
  })

  it('uses last pre-cycle snapshot as baseline when multiple exist', () => {
    const snapshots = [
      snap('a1', '2024-05-15T00:00:00.000Z', 8000),
      snap('a1', '2024-05-29T00:00:00.000Z', 9500), // most recent pre-cycle
      snap('a1', '2024-06-08T00:00:00.000Z', 11000),
    ]
    const result = computeActivity(snapshots, cycleStart)
    expect(result.get('a1')?.baseline).toBe(9500)
  })

  it('returns negative delta for paid-down credit cards', () => {
    const snapshots = [
      snap('cc', '2024-05-31T00:00:00.000Z', 50000), // owed $500
      snap('cc', '2024-06-15T00:00:00.000Z', 20000), // paid down to $200
    ]
    const result = computeActivity(snapshots, cycleStart)
    expect(result.get('cc')?.delta).toBe(-30000)
  })

  it('handles multiple accounts independently', () => {
    const snapshots = [
      snap('a1', '2024-05-31T00:00:00.000Z', 1000),
      snap('a1', '2024-06-05T00:00:00.000Z', 1500),
      snap('a2', '2024-05-31T00:00:00.000Z', 2000),
      snap('a2', '2024-06-05T00:00:00.000Z', 2200),
    ]
    const result = computeActivity(snapshots, cycleStart)
    expect(result.get('a1')?.delta).toBe(500)
    expect(result.get('a2')?.delta).toBe(200)
  })

  it('returns current=baseline and delta=0 when only a single pre-cycle snapshot exists', () => {
    const snapshots = [
      snap('a1', '2024-05-20T00:00:00.000Z', 5000),
    ]
    const result = computeActivity(snapshots, cycleStart)
    expect(result.get('a1')).toEqual({ baseline: 5000, current: 5000, delta: 0 })
  })
})
