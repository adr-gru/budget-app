import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.startsWith('https://your-project')

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder-key')

export type AccountType = 'credit_card' | 'checking' | 'savings' | 'investment'
export type Bucket     = 'needs' | 'wants' | 'savings'
export type SubCadence = 'weekly' | 'monthly' | 'yearly'

export interface Profile {
  user_id: string
  paycheck_cents: number
  needs_pct: number
  wants_pct: number
  savings_pct: number
  cycle_anchor_date: string
  updated_at: string
}

export interface Account {
  id: string
  user_id: string
  name: string
  type: AccountType
  credit_limit_cents: number | null
  sort_order: number
  archived: boolean
  created_at: string
}

export interface BalanceSnapshot {
  id: string
  account_id: string
  user_id: string
  balance_cents: number
  recorded_at: string
}

export interface Subscription {
  id: string
  user_id: string
  name: string
  amount_cents: number
  cadence: SubCadence
  next_charge_on: string
  bucket: Bucket
  active: boolean
  sort_order: number
  created_at: string
}
