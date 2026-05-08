import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Category, Transaction } from '../lib/supabase'
import { weekEnd, weekStart, weekKey } from '../lib/week'
import { format } from 'date-fns'

function weekRange(ws: Date) {
  const start = format(weekStart(ws), 'yyyy-MM-dd')
  const end = format(weekEnd(ws), 'yyyy-MM-dd')
  return { start, end }
}

export function useTransactions(ws: Date) {
  const key = weekKey(ws)
  return useQuery({
    queryKey: ['transactions', key],
    queryFn: async () => {
      const { start, end } = weekRange(ws)
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('occurred_on', start)
        .lte('occurred_on', end)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Transaction[]
    }
  })
}

export interface AddTransactionInput {
  amount_cents: number
  category: Category
  occurred_on: string
  note: string
}

export function useAddTransaction(ws: Date) {
  const qc = useQueryClient()
  const key = weekKey(ws)

  return useMutation({
    mutationFn: async (input: AddTransactionInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const row = {
        ...input,
        user_id: user.id,
        client_id: crypto.randomUUID(),
        note: input.note || null
      }
      const { data, error } = await supabase.from('transactions').insert(row).select().single()
      if (error) throw error
      return data as Transaction
    },
    onSuccess: (newTx) => {
      const { start, end } = weekRange(ws)
      if (newTx.occurred_on >= start && newTx.occurred_on <= end) {
        qc.setQueryData<Transaction[]>(['transactions', key], (old = []) => [newTx, ...old])
      }
      qc.invalidateQueries({ queryKey: ['transactions', key] })
    }
  })
}

export function useDeleteTransaction(ws: Date) {
  const qc = useQueryClient()
  const key = weekKey(ws)

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, id) => {
      qc.setQueryData<Transaction[]>(['transactions', key], (old = []) =>
        old.filter(t => t.id !== id)
      )
    }
  })
}
