import { describe, it, expect } from 'vitest'
import { addDays, addMonths, addYears, format, parseISO } from 'date-fns'
import { advanceNextCharge, skipNextCharge, subsThisCycle, monthlyEquivalentCents } from '../subscriptions'
import type { Subscription } from '../../lib/supabase'

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub1',
    user_id: 'user',
    name: 'Netflix',
    amount_cents: 1599,
    cadence: 'monthly',
    next_charge_on: '2099-01-01',
    bucket: 'wants',
    active: true,
    sort_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('advanceNextCharge', () => {
  it('returns unchanged when date is already in the future', () => {
    const sub = makeSub({ next_charge_on: '2099-01-01', cadence: 'monthly' })
    expect(advanceNextCharge(sub)).toBe('2099-01-01')
  })

  it('returns unchanged for future weekly subscription', () => {
    const sub = makeSub({ next_charge_on: '2099-06-01', cadence: 'weekly' })
    expect(advanceNextCharge(sub)).toBe('2099-06-01')
  })

  it('advances weekly past date until in the future', () => {
    const sub = makeSub({ next_charge_on: '2020-01-01', cadence: 'weekly' })
    const result = advanceNextCharge(sub)
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    // result must be on or after today
    expect(result >= todayStr).toBe(true)
    // going back one period must be before today
    const prevStr = format(addDays(parseISO(result), -7), 'yyyy-MM-dd')
    expect(prevStr < todayStr).toBe(true)
  })

  it('advances monthly past date until in the future', () => {
    const sub = makeSub({ next_charge_on: '2020-03-15', cadence: 'monthly' })
    const result = advanceNextCharge(sub)
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    expect(result >= todayStr).toBe(true)
    const prevStr = format(addMonths(parseISO(result), -1), 'yyyy-MM-dd')
    expect(prevStr < todayStr).toBe(true)
  })

  it('advances yearly past date until in the future', () => {
    const sub = makeSub({ next_charge_on: '2020-06-01', cadence: 'yearly' })
    const result = advanceNextCharge(sub)
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    expect(result >= todayStr).toBe(true)
    const prevStr = format(addYears(parseISO(result), -1), 'yyyy-MM-dd')
    expect(prevStr < todayStr).toBe(true)
  })

  it('handles multiple missed periods by advancing until future', () => {
    // 2019 is many periods in the past; should still reach the future
    const sub = makeSub({ next_charge_on: '2019-01-01', cadence: 'monthly' })
    const result = advanceNextCharge(sub)
    expect(result >= format(new Date(), 'yyyy-MM-dd')).toBe(true)
  })
})

describe('skipNextCharge', () => {
  it('advances weekly by exactly 7 days', () => {
    const sub = makeSub({ next_charge_on: '2024-01-01', cadence: 'weekly' })
    expect(skipNextCharge(sub)).toBe('2024-01-08')
  })

  it('advances monthly by exactly 1 month', () => {
    const sub = makeSub({ next_charge_on: '2024-01-15', cadence: 'monthly' })
    expect(skipNextCharge(sub)).toBe('2024-02-15')
  })

  it('advances monthly correctly across month boundaries', () => {
    const sub = makeSub({ next_charge_on: '2024-01-31', cadence: 'monthly' })
    // Jan 31 + 1 month = Feb 29 (2024 is a leap year)
    expect(skipNextCharge(sub)).toBe('2024-02-29')
  })

  it('advances yearly by exactly 1 year', () => {
    const sub = makeSub({ next_charge_on: '2024-03-01', cadence: 'yearly' })
    expect(skipNextCharge(sub)).toBe('2025-03-01')
  })

  it('advances even if date is already in the future', () => {
    const sub = makeSub({ next_charge_on: '2099-06-01', cadence: 'monthly' })
    expect(skipNextCharge(sub)).toBe('2099-07-01')
  })

  it('advances from a past date by exactly one period (not to future)', () => {
    const sub = makeSub({ next_charge_on: '2020-01-01', cadence: 'weekly' })
    expect(skipNextCharge(sub)).toBe('2020-01-08')
  })
})

describe('subsThisCycle', () => {
  // cycleStart = 2024-06-01, cycleEnd = 2024-06-14 (addDays(start, 13))
  const cycleStart = parseISO('2024-06-01')

  it('includes subscription on cycle start date', () => {
    const sub = makeSub({ next_charge_on: '2024-06-01' })
    expect(subsThisCycle([sub], cycleStart)).toHaveLength(1)
  })

  it('includes subscription on cycle end date', () => {
    const sub = makeSub({ next_charge_on: '2024-06-14' })
    expect(subsThisCycle([sub], cycleStart)).toHaveLength(1)
  })

  it('includes subscription in the middle of the cycle', () => {
    const sub = makeSub({ next_charge_on: '2024-06-07' })
    expect(subsThisCycle([sub], cycleStart)).toHaveLength(1)
  })

  it('excludes subscription the day before cycle start', () => {
    const sub = makeSub({ next_charge_on: '2024-05-31' })
    expect(subsThisCycle([sub], cycleStart)).toHaveLength(0)
  })

  it('excludes subscription the day after cycle end', () => {
    const sub = makeSub({ next_charge_on: '2024-06-15' })
    expect(subsThisCycle([sub], cycleStart)).toHaveLength(0)
  })

  it('returns multiple matching subscriptions', () => {
    const subs = [
      makeSub({ id: 's1', next_charge_on: '2024-06-05' }),
      makeSub({ id: 's2', next_charge_on: '2024-06-10' }),
      makeSub({ id: 's3', next_charge_on: '2024-05-15' }),
    ]
    expect(subsThisCycle(subs, cycleStart)).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(subsThisCycle([], cycleStart)).toHaveLength(0)
  })

  it('returns empty when no subscriptions fall in cycle', () => {
    const subs = [
      makeSub({ id: 's1', next_charge_on: '2024-05-01' }),
      makeSub({ id: 's2', next_charge_on: '2024-07-01' }),
    ]
    expect(subsThisCycle(subs, cycleStart)).toHaveLength(0)
  })
})

describe('monthlyEquivalentCents', () => {
  it('returns amount unchanged for monthly', () => {
    const sub = makeSub({ amount_cents: 1599, cadence: 'monthly' })
    expect(monthlyEquivalentCents(sub)).toBe(1599)
  })

  it('converts weekly to monthly equivalent (52/12)', () => {
    const sub = makeSub({ amount_cents: 1200, cadence: 'weekly' })
    expect(monthlyEquivalentCents(sub)).toBe(Math.round(1200 * 52 / 12))
  })

  it('converts yearly to monthly equivalent (1/12)', () => {
    const sub = makeSub({ amount_cents: 12000, cadence: 'yearly' })
    expect(monthlyEquivalentCents(sub)).toBe(Math.round(12000 / 12))
  })

  it('rounds fractional cents on weekly conversion', () => {
    // 100 * 52 / 12 = 433.33… → 433
    const sub = makeSub({ amount_cents: 100, cadence: 'weekly' })
    expect(monthlyEquivalentCents(sub)).toBe(433)
  })

  it('rounds fractional cents on yearly conversion', () => {
    // 100 / 12 = 8.33… → 8
    const sub = makeSub({ amount_cents: 100, cadence: 'yearly' })
    expect(monthlyEquivalentCents(sub)).toBe(8)
  })
})
