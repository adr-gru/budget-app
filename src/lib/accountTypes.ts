import type { AccountType } from './supabase'

export interface AccountTypeMeta {
  label: string
  color: string
  isDebt: boolean
}

export const ACCOUNT_TYPE_META: Record<AccountType, AccountTypeMeta> = {
  credit_card: { label: 'Credit Cards', color: '#ef4444', isDebt: true  },
  checking:    { label: 'Checking',     color: '#3b82f6', isDebt: false },
  savings:     { label: 'Savings',      color: '#22c55e', isDebt: false },
  investment:  { label: 'Investments',  color: '#a855f7', isDebt: false }
}

export const ACCOUNT_TYPES: AccountType[] = ['credit_card', 'checking', 'savings', 'investment']
