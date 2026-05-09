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
export type Bucket      = 'needs' | 'wants' | 'savings'
export type SubCadence  = 'weekly' | 'monthly' | 'yearly'

export type TransactionBucket = 'needs' | 'wants' | 'savings' | 'uncategorized'

export type DashboardWidgetType =
  | 'net_worth'
  | 'total_cash'
  | 'total_savings'
  | 'total_investments'
  | 'total_debt'
  | 'account'

export interface DashboardWidget {
  type: DashboardWidgetType
  account_id?: string
}

export interface Profile {
  user_id:           string
  paycheck_cents:    number
  needs_pct:         number
  wants_pct:         number
  savings_pct:       number
  cycle_anchor_date: string
  updated_at:        string
  dashboard_widget:  DashboardWidget | null
}

export interface Account {
  id:                      string
  user_id:                 string
  name:                    string
  type:                    AccountType
  credit_limit_cents:      number | null
  due_day:                 number | null
  sort_order:              number
  archived:                boolean
  created_at:              string
  teller_account_id:       string | null
  teller_enrollment_id:    string | null
  teller_institution_name: string | null
  teller_last_synced_at:   string | null
  plaid_account_id:        string | null
  plaid_item_id:           string | null
  plaid_institution_name:  string | null
  plaid_last_synced_at:    string | null
}

export interface BalanceSnapshot {
  id:            string
  account_id:    string
  user_id:       string
  balance_cents: number
  recorded_at:   string
}

export interface TellerEnrollment {
  id:                  string
  user_id:             string
  teller_access_token: string
  institution_name:    string | null
  created_at:          string
}

export interface PlaidItem {
  id:               string
  user_id:          string
  plaid_item_id:    string
  institution_name: string | null
  created_at:       string
}

export interface Transaction {
  id:                    string
  user_id:               string
  account_id:            string | null
  teller_transaction_id: string | null
  plaid_transaction_id:  string | null
  amount_cents:          number
  description:           string
  merchant_name:         string | null
  pfc_primary:           string | null
  pfc_detailed:          string | null
  date:                  string
  bucket:                TransactionBucket
  tag:                   string | null
  category_override:     boolean
  created_at:            string
}

export interface Subscription {
  id:             string
  user_id:        string
  name:           string
  amount_cents:   number
  cadence:        SubCadence
  next_charge_on: string
  bucket:         Bucket
  active:         boolean
  sort_order:     number
  created_at:     string
}

export interface Goal {
  id:                string
  user_id:           string
  name:              string
  target_cents:      number
  current_cents:     number
  linked_account_id: string | null
  target_date:       string | null
  sort_order:        number
  created_at:        string
}

export type ContributionSource = 'auto' | 'manual'
export type DevicePlatform     = 'ios' | 'android' | 'web'

export interface GoalContribution {
  id:           string
  goal_id:      string
  user_id:      string
  amount_cents: number
  occurred_on:  string
  source:       ContributionSource
  snapshot_id:  string | null
  note:         string | null
  created_at:   string
}

export interface DeviceToken {
  id:         string
  user_id:    string
  token:      string
  platform:   DevicePlatform
  created_at: string
}
