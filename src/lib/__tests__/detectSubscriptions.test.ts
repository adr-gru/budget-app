import { describe, it, expect } from 'vitest'
import { normalizeDescription, detectSubscriptions, detectByCategory } from '../detectSubscriptions'
import type { Transaction } from '../supabase'

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx1',
    user_id: 'user',
    account_id: null,
    teller_transaction_id: null,
    plaid_transaction_id: null,
    amount_cents: 999,
    description: 'Test Merchant',
    merchant_name: null,
    pfc_primary: null,
    pfc_detailed: null,
    date: '2024-01-01',
    bucket: 'wants',
    tag: null,
    category_override: false,
    is_income: false,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('normalizeDescription', () => {
  it('lowercases the string', () => {
    expect(normalizeDescription('NETFLIX')).toBe('netflix')
  })

  it('strips * and # characters', () => {
    expect(normalizeDescription('*NETFLIX#')).toBe('netflix')
  })

  it('strips runs of 4 or more digits', () => {
    expect(normalizeDescription('NETFLIX 1234567')).toBe('netflix')
  })

  it('does not strip runs of 3 or fewer digits', () => {
    expect(normalizeDescription('plan 123')).toBe('plan 123')
  })

  it('collapses multiple spaces into one', () => {
    expect(normalizeDescription('net  flix')).toBe('net flix')
  })

  it('trims leading and trailing whitespace', () => {
    expect(normalizeDescription('  netflix  ')).toBe('netflix')
  })

  it('handles empty string', () => {
    expect(normalizeDescription('')).toBe('')
  })
})

describe('detectSubscriptions', () => {
  it('returns empty array for no transactions', () => {
    expect(detectSubscriptions([], new Set())).toEqual([])
  })

  it('ignores single-occurrence merchants', () => {
    const txs = [makeTx({ merchant_name: 'Netflix', date: '2024-01-01', amount_cents: 1599 })]
    expect(detectSubscriptions(txs, new Set())).toHaveLength(0)
  })

  it('ignores transactions with amount_cents <= 0', () => {
    const txs = [
      makeTx({ merchant_name: 'Payroll', date: '2024-01-01', amount_cents: -100000 }),
      makeTx({ merchant_name: 'Payroll', date: '2024-02-01', amount_cents: -100000 }),
    ]
    expect(detectSubscriptions(txs, new Set())).toHaveLength(0)
  })

  it('detects monthly subscription (gaps 25–35 days)', () => {
    const txs = [
      makeTx({ merchant_name: 'Netflix', date: '2024-01-15', amount_cents: 1599 }),
      makeTx({ merchant_name: 'Netflix', date: '2024-02-15', amount_cents: 1599 }),
      makeTx({ merchant_name: 'Netflix', date: '2024-03-15', amount_cents: 1599 }),
    ]
    const result = detectSubscriptions(txs, new Set())
    expect(result).toHaveLength(1)
    expect(result[0].cadence).toBe('monthly')
    expect(result[0].amount_cents).toBe(1599)
    expect(result[0].name).toBe('Netflix')
    expect(result[0].source).toBe('recurring')
  })

  it('detects weekly subscription (gaps 6–9 days)', () => {
    const txs = [
      makeTx({ merchant_name: 'Gym', date: '2024-01-01', amount_cents: 500 }),
      makeTx({ merchant_name: 'Gym', date: '2024-01-08', amount_cents: 500 }),
      makeTx({ merchant_name: 'Gym', date: '2024-01-15', amount_cents: 500 }),
    ]
    const result = detectSubscriptions(txs, new Set())
    expect(result).toHaveLength(1)
    expect(result[0].cadence).toBe('weekly')
  })

  it('detects yearly subscription (gaps 355–380 days)', () => {
    const txs = [
      makeTx({ merchant_name: 'Amazon Prime', date: '2022-03-01', amount_cents: 13900 }),
      makeTx({ merchant_name: 'Amazon Prime', date: '2023-03-01', amount_cents: 13900 }),
      makeTx({ merchant_name: 'Amazon Prime', date: '2024-03-01', amount_cents: 13900 }),
    ]
    const result = detectSubscriptions(txs, new Set())
    expect(result).toHaveLength(1)
    expect(result[0].cadence).toBe('yearly')
  })

  it('rejects when median gap is not in any recognized cadence range', () => {
    const txs = [
      makeTx({ merchant_name: 'Random', date: '2024-01-01', amount_cents: 500 }),
      makeTx({ merchant_name: 'Random', date: '2024-01-20', amount_cents: 500 }),
    ]
    expect(detectSubscriptions(txs, new Set())).toHaveLength(0)
  })

  it('rejects when amount variance is 25% or more from median', () => {
    // 3 txs: [700, 1000, 1000] — median = 1000, 700 is 30% below → fails
    const txs = [
      makeTx({ merchant_name: 'Vary', date: '2024-01-01', amount_cents: 700 }),
      makeTx({ merchant_name: 'Vary', date: '2024-02-01', amount_cents: 1000 }),
      makeTx({ merchant_name: 'Vary', date: '2024-03-01', amount_cents: 1000 }),
    ]
    expect(detectSubscriptions(txs, new Set())).toHaveLength(0)
  })

  it('accepts when amount variance is under 25% from median', () => {
    // 3 txs: [1000, 1200, 1200] — median = 1200, 1000 is 16.7% below → passes
    const txs = [
      makeTx({ merchant_name: 'Vary', date: '2024-01-01', amount_cents: 1000 }),
      makeTx({ merchant_name: 'Vary', date: '2024-02-01', amount_cents: 1200 }),
      makeTx({ merchant_name: 'Vary', date: '2024-03-01', amount_cents: 1200 }),
    ]
    expect(detectSubscriptions(txs, new Set())).toHaveLength(1)
  })

  it('skips merchants already in existingNormalized', () => {
    const txs = [
      makeTx({ merchant_name: 'Netflix', date: '2024-01-15', amount_cents: 1599 }),
      makeTx({ merchant_name: 'Netflix', date: '2024-02-15', amount_cents: 1599 }),
    ]
    expect(detectSubscriptions(txs, new Set(['netflix']))).toHaveLength(0)
  })

  it('infers bucket from majority of non-uncategorized transactions', () => {
    const txs = [
      makeTx({ merchant_name: 'Gym', date: '2024-01-01', amount_cents: 500, bucket: 'needs' }),
      makeTx({ merchant_name: 'Gym', date: '2024-02-01', amount_cents: 500, bucket: 'needs' }),
      makeTx({ merchant_name: 'Gym', date: '2024-03-01', amount_cents: 500, bucket: 'wants' }),
    ]
    expect(detectSubscriptions(txs, new Set())[0].bucket).toBe('needs')
  })

  it('uses merchant_name as grouping key when present', () => {
    const txs = [
      makeTx({ merchant_name: 'Netflix', description: 'NFLX*001', date: '2024-01-15', amount_cents: 1599 }),
      makeTx({ merchant_name: 'Netflix', description: 'NFLX*002', date: '2024-02-15', amount_cents: 1599 }),
    ]
    const result = detectSubscriptions(txs, new Set())
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Netflix')
  })

  it('falls back to normalized description when merchant_name is null', () => {
    const txs = [
      makeTx({ merchant_name: null, description: 'SPOTIFY PREMIUM', date: '2024-01-01', amount_cents: 999 }),
      makeTx({ merchant_name: null, description: 'SPOTIFY PREMIUM', date: '2024-02-01', amount_cents: 999 }),
    ]
    const result = detectSubscriptions(txs, new Set())
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('SPOTIFY PREMIUM')
  })

  it('sets next_charge_on based on last seen date and cadence', () => {
    const txs = [
      makeTx({ merchant_name: 'Netflix', date: '2024-01-15', amount_cents: 1599 }),
      makeTx({ merchant_name: 'Netflix', date: '2024-02-15', amount_cents: 1599 }),
    ]
    const result = detectSubscriptions(txs, new Set())
    expect(result[0].next_charge_on).toBe('2024-03-15')
  })

  it('does not detect when two merchants never share a key', () => {
    const txs = [
      makeTx({ merchant_name: 'Netflix', date: '2024-01-15', amount_cents: 1599 }),
      makeTx({ merchant_name: 'Spotify', date: '2024-01-20', amount_cents: 999 }),
    ]
    expect(detectSubscriptions(txs, new Set())).toHaveLength(0)
  })
})

describe('detectByCategory', () => {
  it('returns empty array for no transactions', () => {
    expect(detectByCategory([], new Set())).toEqual([])
  })

  it('only includes transactions with subscription PFC categories', () => {
    const txs = [
      makeTx({ merchant_name: 'Netflix', pfc_detailed: 'ENTERTAINMENT_TV_AND_MOVIES', date: '2024-01-01', amount_cents: 1599 }),
      makeTx({ merchant_name: 'Grocery', pfc_detailed: 'FOOD_AND_DRINK_GROCERIES', date: '2024-01-05', amount_cents: 5000 }),
    ]
    const result = detectByCategory(txs, new Set())
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Netflix')
  })

  it('excludes merchants in excludeKeys', () => {
    const txs = [
      makeTx({ merchant_name: 'Netflix', pfc_detailed: 'ENTERTAINMENT_TV_AND_MOVIES', date: '2024-01-01', amount_cents: 1599 }),
    ]
    expect(detectByCategory(txs, new Set(['netflix']))).toHaveLength(0)
  })

  it('uses median amount when multiple transactions exist', () => {
    // sorted: [999, 999, 1299] → median at index 1 = 999
    const txs = [
      makeTx({ merchant_name: 'Spotify', pfc_detailed: 'ENTERTAINMENT_MUSIC_AND_AUDIO', date: '2024-01-01', amount_cents: 999 }),
      makeTx({ merchant_name: 'Spotify', pfc_detailed: 'ENTERTAINMENT_MUSIC_AND_AUDIO', date: '2024-02-01', amount_cents: 999 }),
      makeTx({ merchant_name: 'Spotify', pfc_detailed: 'ENTERTAINMENT_MUSIC_AND_AUDIO', date: '2024-03-01', amount_cents: 1299 }),
    ]
    const result = detectByCategory(txs, new Set())
    expect(result).toHaveLength(1)
    expect(result[0].amount_cents).toBe(999)
  })

  it('sets source to category', () => {
    const txs = [
      makeTx({ merchant_name: 'Netflix', pfc_detailed: 'ENTERTAINMENT_TV_AND_MOVIES', date: '2024-01-01', amount_cents: 1599 }),
    ]
    expect(detectByCategory(txs, new Set())[0].source).toBe('category')
  })

  it('defaults bucket to wants when transaction bucket is uncategorized', () => {
    const txs = [
      makeTx({ merchant_name: 'Netflix', pfc_detailed: 'ENTERTAINMENT_TV_AND_MOVIES', date: '2024-01-01', amount_cents: 1599, bucket: 'uncategorized' }),
    ]
    expect(detectByCategory(txs, new Set())[0].bucket).toBe('wants')
  })

  it('ignores transactions without pfc_detailed', () => {
    const txs = [
      makeTx({ merchant_name: 'Something', pfc_detailed: null, date: '2024-01-01', amount_cents: 999 }),
    ]
    expect(detectByCategory(txs, new Set())).toHaveLength(0)
  })

  it('ignores transactions with non-subscription pfc_detailed', () => {
    const txs = [
      makeTx({ merchant_name: 'Supermarket', pfc_detailed: 'FOOD_AND_DRINK_GROCERIES', amount_cents: 5000 }),
    ]
    expect(detectByCategory(txs, new Set())).toHaveLength(0)
  })

  it('always infers cadence as monthly', () => {
    const txs = [
      makeTx({ merchant_name: 'Netflix', pfc_detailed: 'ENTERTAINMENT_TV_AND_MOVIES', date: '2024-01-01', amount_cents: 1599 }),
    ]
    expect(detectByCategory(txs, new Set())[0].cadence).toBe('monthly')
  })
})
