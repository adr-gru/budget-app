import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

async function invokeEdgeFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw error
  return data as T
}

export function usePlaidLinkTokenImperative() {
  return useCallback(async (): Promise<string> => {
    const result = await invokeEdgeFn<{ link_token: string }>('plaid-link-token', {})
    return result.link_token
  }, [])
}

interface ExchangeInput {
  public_token: string
  institution_name: string | null
  plaid_accounts: Array<{
    id: string
    name: string
    type: string
    subtype: string | null
    mask: string | null
  }>
}

interface ExchangeResult {
  plaid_item_db_id: string
}

export function usePlaidExchange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ExchangeInput) =>
      invokeEdgeFn<ExchangeResult>('plaid-exchange', input as unknown as Record<string, unknown>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] })
  })
}

interface LinkAccountInput {
  account_id: string
  plaid_account_id: string
  plaid_item_db_id: string
  institution_name: string | null
}

export function useLinkAccountToPlaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ account_id, plaid_account_id, plaid_item_db_id, institution_name }: LinkAccountInput) => {
      const { error } = await supabase
        .from('accounts')
        .update({
          plaid_account_id,
          plaid_item_id: plaid_item_db_id,
          plaid_institution_name: institution_name
        })
        .eq('id', account_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] })
  })
}

export function usePlaidSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => invokeEdgeFn<{ synced: number }>('plaid-sync', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    }
  })
}

export function usePlaidImportTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => invokeEdgeFn<{ imported: number }>('plaid-transactions', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] })
  })
}
