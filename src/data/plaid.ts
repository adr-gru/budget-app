import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { PlaidLinkAccount } from '../lib/plaid.d'

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

export function useLoadPlaidLink() {
  return useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.Plaid) { resolve(); return }
      const existing = document.querySelector('script[src*="plaid.com/link"]')
      if (existing) {
        existing.addEventListener('load', () => resolve())
        return
      }
      const s = document.createElement('script')
      s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
      s.onload  = () => resolve()
      s.onerror = () => reject(new Error('Failed to load Plaid Link'))
      document.head.appendChild(s)
    })
  }, [])
}

interface ExchangeInput {
  public_token:     string
  institution_name: string | null
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

export interface PlaidItem {
  id:               string
  institution_name: string | null
  created_at:       string
  plaid_item_id:    string
}

export function usePlaidItems() {
  return useQuery({
    queryKey: ['plaid', 'items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plaid_items')
        .select('id, institution_name, created_at, plaid_item_id')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as PlaidItem[]
    }
  })
}

interface ListAccountsResult {
  institution_name: string | null
  accounts:         PlaidLinkAccount[]
}

export function usePlaidListAccounts() {
  return useMutation({
    mutationFn: (plaid_item_db_id: string) =>
      invokeEdgeFn<ListAccountsResult>('plaid-list-accounts', { plaid_item_db_id }),
  })
}

export function usePlaidRemoveItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (plaid_item_db_id: string) =>
      invokeEdgeFn<{ ok: boolean }>('plaid-remove-item', { plaid_item_db_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plaid', 'items'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['snapshots'] })
    }
  })
}
