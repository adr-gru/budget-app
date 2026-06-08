import type { AccountType } from '../../lib/supabase'

export interface AccountConfig {
  checked:    boolean
  nickname:   string
  limitValue: string
  dueDay:     string
}

export function mapPlaidType(type: string, subtype: string): AccountType {
  if (type === 'credit') return 'credit_card'
  if (type === 'investment') return 'investment'
  const savingsSubtypes = ['savings', 'cd', 'money market', 'cash management']
  if (savingsSubtypes.includes(subtype.toLowerCase())) return 'savings'
  return 'checking'
}
