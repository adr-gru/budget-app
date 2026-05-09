import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Transaction, TransactionBucket } from '../lib/supabase'

export function useTransactions() {
  return useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data as Transaction[]
    }
  })
}

export function useCycleTransactionBuckets(cycleStart: string, cycleEnd: string) {
  return useQuery({
    queryKey: ['transactions', 'buckets', cycleStart, cycleEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('bucket, amount_cents')
        .gte('date', cycleStart)
        .lte('date', cycleEnd)
      if (error) throw error
      if (!data || data.length === 0) return null

      const totals: Record<TransactionBucket, number> = {
        needs: 0, wants: 0, savings: 0, uncategorized: 0
      }
      for (const tx of data) {
        const b = tx.bucket as TransactionBucket
        totals[b] = (totals[b] ?? 0) + tx.amount_cents
      }
      return totals
    }
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, bucket, tag }: { id: string; bucket: TransactionBucket; tag: string | null }) => {
      const { data, error } = await supabase
        .from('transactions')
        .update({ bucket, tag, category_override: true })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Transaction
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] })
  })
}
