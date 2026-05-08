import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// True only when real (non-placeholder) credentials are present.
// App.tsx checks this flag and renders a setup screen instead of crashing.
export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.startsWith('https://your-project')

// Create a real client only when configured; otherwise use a stub that satisfies
// the type so the rest of the module can import without throwing at module load.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder-key')

export type Category =
  | 'housing_utilities'
  | 'food_groceries'
  | 'transport'
  | 'entertainment'
  | 'subscriptions'
  | 'savings_investments'

export interface Transaction {
  id: string
  user_id: string
  amount_cents: number
  category: Category
  occurred_on: string
  note: string | null
  client_id: string
  created_at: string
}

export interface CategoryTarget {
  user_id: string
  category: Category
  target_cents: number
  updated_at: string
}
