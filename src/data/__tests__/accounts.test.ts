import { describe, it, expect } from 'vitest'
import { getLastSyncedAt } from '../accounts'
import type { Account } from '../../lib/supabase'

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc1',
    user_id: 'user',
    name: 'Checking',
    type: 'checking',
    credit_limit_cents: null,
    due_day: null,
    sort_order: 0,
    archived: false,
    created_at: '2024-01-01',
    teller_account_id: null,
    teller_enrollment_id: null,
    teller_institution_name: null,
    teller_last_synced_at: null,
    plaid_account_id: null,
    plaid_item_id: null,
    plaid_institution_name: null,
    plaid_last_synced_at: null,
    ...overrides,
  }
}

describe('getLastSyncedAt', () => {
  it('returns null when no accounts', () => {
    expect(getLastSyncedAt([])).toBeNull()
  })

  it('returns null when no linked accounts', () => {
    const accounts = [makeAccount({ plaid_item_id: null })]
    expect(getLastSyncedAt(accounts)).toBeNull()
  })

  it('returns null when linked accounts have no sync date', () => {
    const accounts = [makeAccount({ plaid_item_id: 'item1', plaid_last_synced_at: null })]
    expect(getLastSyncedAt(accounts)).toBeNull()
  })

  it('returns sync date of a single linked account', () => {
    const accounts = [
      makeAccount({ plaid_item_id: 'item1', plaid_last_synced_at: '2024-06-01T10:00:00Z' }),
    ]
    expect(getLastSyncedAt(accounts)).toBe('2024-06-01T10:00:00Z')
  })

  it('returns the most recent sync date across multiple linked accounts', () => {
    const accounts = [
      makeAccount({ id: 'a1', plaid_item_id: 'item1', plaid_last_synced_at: '2024-06-01T10:00:00Z' }),
      makeAccount({ id: 'a2', plaid_item_id: 'item2', plaid_last_synced_at: '2024-06-03T08:00:00Z' }),
      makeAccount({ id: 'a3', plaid_item_id: 'item3', plaid_last_synced_at: '2024-06-02T12:00:00Z' }),
    ]
    expect(getLastSyncedAt(accounts)).toBe('2024-06-03T08:00:00Z')
  })

  it('ignores unlinked accounts', () => {
    const accounts = [
      makeAccount({ id: 'a1', plaid_item_id: null, plaid_last_synced_at: null }),
      makeAccount({ id: 'a2', plaid_item_id: 'item2', plaid_last_synced_at: '2024-06-01T00:00:00Z' }),
    ]
    expect(getLastSyncedAt(accounts)).toBe('2024-06-01T00:00:00Z')
  })
})
