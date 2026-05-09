import type { AccountType } from './supabase'

export interface AccountTypeMeta {
  label: string
  color: string
  isDebt: boolean
}

export const ACCOUNT_TYPE_META: Record<AccountType, AccountTypeMeta> = {
  credit_card: { label: 'Credit Cards', color: '#DC2626', isDebt: true  },
  checking:    { label: 'Checking',     color: '#3B82F6', isDebt: false },
  savings:     { label: 'Savings',      color: '#16A34A', isDebt: false },
  investment:  { label: 'Investments',  color: '#8B5CF6', isDebt: false }
}

export const ACCOUNT_TYPES: AccountType[] = ['credit_card', 'checking', 'savings', 'investment']
