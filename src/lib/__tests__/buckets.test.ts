import { describe, it, expect } from 'vitest'
import { bucketTargetCents, bucketPct } from '../buckets'
import type { Profile } from '../supabase'

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    user_id: 'user',
    updated_at: '2024-01-01',
    paycheck_cents: 300000, // $3,000
    needs_pct: 50,
    wants_pct: 30,
    savings_pct: 20,
    cycle_anchor_date: '2024-01-01',
    dashboard_widget: { type: 'net_worth' },
    ...overrides,
  }
}

describe('bucketTargetCents', () => {
  it('computes 50/30/20 targets correctly', () => {
    const profile = makeProfile()
    expect(bucketTargetCents(profile, 'needs')).toBe(150000)   // $1,500
    expect(bucketTargetCents(profile, 'wants')).toBe(90000)    // $900
    expect(bucketTargetCents(profile, 'savings')).toBe(60000)  // $600
  })

  it('rounds fractional cents', () => {
    const profile = makeProfile({ paycheck_cents: 10000, needs_pct: 33 })
    expect(bucketTargetCents(profile, 'needs')).toBe(3300)
  })

  it('sums to paycheck when percentages add up to 100', () => {
    const profile = makeProfile({ needs_pct: 50, wants_pct: 30, savings_pct: 20 })
    const total = bucketTargetCents(profile, 'needs')
               + bucketTargetCents(profile, 'wants')
               + bucketTargetCents(profile, 'savings')
    expect(total).toBe(profile.paycheck_cents)
  })
})

describe('bucketPct', () => {
  it('returns the correct percentage for each bucket', () => {
    const profile = makeProfile()
    expect(bucketPct(profile, 'needs')).toBe(50)
    expect(bucketPct(profile, 'wants')).toBe(30)
    expect(bucketPct(profile, 'savings')).toBe(20)
  })
})
