import type { Category } from './supabase'

export interface CategoryMeta {
  label: string
  icon: string
  color: string
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  housing_utilities: { label: 'Housing & Utilities', icon: '⌂', color: '#60a5fa' },
  food_groceries:    { label: 'Food & Groceries',    icon: '⊛', color: '#34d399' },
  transport:         { label: 'Transport',            icon: '⇢', color: '#fb923c' },
  entertainment:     { label: 'Entertainment',        icon: '◈', color: '#e879f9' },
  subscriptions:     { label: 'Subscriptions',        icon: '↺', color: '#a78bfa' },
  savings_investments: { label: 'Savings & Investments', icon: '◆', color: '#fbbf24' }
}

export const CATEGORIES = Object.keys(CATEGORY_META) as Category[]
