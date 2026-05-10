import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, addMonths, addYears, format, isBefore, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { Bucket, SubCadence, Subscription } from '../lib/supabase'
import { cycleEnd } from '../lib/cycle'
import { useTransactions } from './transactions'
import { detectSubscriptions, detectByCategory, normalizeDescription, type SuggestedSubscription } from '../lib/detectSubscriptions'

export type { SuggestedSubscription }

export function useSubscriptions() {
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Subscription[]
    }
  })
}

export interface AddSubscriptionInput {
  name: string
  amount_cents: number
  cadence: SubCadence
  next_charge_on: string
  bucket: Bucket
}

export function useAddSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddSubscriptionInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('subscriptions')
        .insert({ ...input, user_id: user.id })
        .select()
        .single()
      if (error) throw error
      return data as Subscription
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] })
  })
}

export function useUpdateSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Omit<Subscription, 'user_id' | 'created_at'>> & { id: string }) => {
      const { data, error } = await supabase
        .from('subscriptions')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Subscription
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] })
  })
}

export function useDeactivateSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('subscriptions')
        .update({ active: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] })
  })
}

// Advance next_charge_on until it's in the future (handles missed cycles)
export function advanceNextCharge(sub: Subscription): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let next = parseISO(sub.next_charge_on)
  while (isBefore(next, today)) {
    if (sub.cadence === 'weekly')  next = addDays(next, 7)
    else if (sub.cadence === 'monthly') next = addMonths(next, 1)
    else next = addYears(next, 1)
  }
  return format(next, 'yyyy-MM-dd')
}

// Returns next_charge_on advanced by exactly one cadence period, regardless of whether the date is past
export function skipNextCharge(sub: Subscription): string {
  let next = parseISO(sub.next_charge_on)
  if (sub.cadence === 'weekly')        next = addDays(next, 7)
  else if (sub.cadence === 'monthly')  next = addMonths(next, 1)
  else                                 next = addYears(next, 1)
  return format(next, 'yyyy-MM-dd')
}

// Returns subscriptions whose next_charge_on falls within the cycle
export function subsThisCycle(subs: Subscription[], cycleStart: Date): Subscription[] {
  const end = cycleEnd(cycleStart)
  return subs.filter(s => {
    const d = parseISO(s.next_charge_on)
    return d >= cycleStart && d <= end
  })
}

// Monthly equivalent for a subscription (for summary totals)
export function monthlyEquivalentCents(sub: Subscription): number {
  if (sub.cadence === 'weekly')  return Math.round(sub.amount_cents * 52 / 12)
  if (sub.cadence === 'yearly')  return Math.round(sub.amount_cents / 12)
  return sub.amount_cents
}

export function useSuggestedSubscriptions() {
  const { data: transactions = [] } = useTransactions()
  const { data: subs = [] } = useSubscriptions()

  return useMemo(() => {
    const existingNormalized = new Set(subs.map(s => normalizeDescription(s.name)))
    const recurring = detectSubscriptions(transactions, existingNormalized)
    const recurringKeys = new Set(recurring.map(r => normalizeDescription(r.name)))
    const categoryHints = detectByCategory(transactions, new Set([...existingNormalized, ...recurringKeys]))
    return [...recurring, ...categoryHints]
  }, [transactions, subs])
}
