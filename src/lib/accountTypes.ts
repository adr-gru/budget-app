import type { AccountType } from './supabase'

export interface AccountTypeMeta {
  label: string
  color: string
  isDebt: boolean
}

export const ACCOUNT_TYPE_META: Record<AccountType, AccountTypeMeta> = {
  credit_card: { label: 'Credit Cards', color: '#f87171', isDebt: true  },
  checking:    { label: 'Checking',     color: '#60a5fa', isDebt: false },
  savings:     { label: 'Savings',      color: '#34d399', isDebt: false },
  investment:  { label: 'Investments',  color: '#fbbf24', isDebt: false }
}

export const ACCOUNT_TYPES: AccountType[] = ['credit_card', 'checking', 'savings', 'investment']
