import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface TransactionRule {
  id:               string
  user_id:          string
  merchant_pattern: string
  bucket:           'needs' | 'wants' | 'savings'
  created_at:       string
}

export function useTransactionRules() {
  return useQuery({
    queryKey: ['transaction_rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transaction_rules')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as TransactionRule[]
    }
  })
}

export function useAddRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ merchant_pattern, bucket }: { merchant_pattern: string; bucket: 'needs' | 'wants' | 'savings' }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('transaction_rules')
        .insert({ user_id: user.id, merchant_pattern, bucket })
        .select()
        .single()
      if (error) throw error
      return data as TransactionRule
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transaction_rules'] })
  })
}

export function useDeleteRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('transaction_rules')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transaction_rules'] })
  })
}

export async function applyRulesToTransactions(rules: TransactionRule[]): Promise<number> {
  let total = 0
  for (const rule of rules) {
    const { data, error } = await supabase
      .from('transactions')
      .update({ bucket: rule.bucket })
      .or(`merchant_name.ilike.${rule.merchant_pattern},description.ilike.${rule.merchant_pattern}`)
      .eq('bucket', 'uncategorized')
      .select('id')
    if (!error && data) total += data.length
  }
  return total
}
