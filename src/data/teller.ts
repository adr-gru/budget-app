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

interface EnrollInput {
  access_token: string
  institution_name: string | null
}

interface EnrollResult {
  enrollment_db_id: string
}

export function useTellerEnroll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: EnrollInput) =>
      invokeEdgeFn<EnrollResult>('teller-enroll', input as unknown as Record<string, unknown>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] })
  })
}

interface LinkAccountInput {
  account_id:           string
  teller_account_id:    string
  teller_enrollment_db_id: string
  institution_name:     string | null
}

export function useLinkAccountToTeller() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ account_id, teller_account_id, teller_enrollment_db_id, institution_name }: LinkAccountInput) => {
      const { error } = await supabase
        .from('accounts')
        .update({
          teller_account_id,
          teller_enrollment_id:    teller_enrollment_db_id,
          teller_institution_name: institution_name,
        })
        .eq('id', account_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] })
  })
}

export function useTellerSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => invokeEdgeFn<{ synced: number }>('teller-sync', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    }
  })
}

export function useTellerImportTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => invokeEdgeFn<{ imported: number }>('teller-transactions', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] })
  })
}

// Loads the Teller Connect script once; resolves when ready
export function useLoadTellerConnect() {
  return useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.TellerConnect) { resolve(); return }
      const existing = document.querySelector('script[src*="teller.io/connect"]')
      if (existing) {
        existing.addEventListener('load', () => resolve())
        return
      }
      const s = document.createElement('script')
      s.src = 'https://cdn.teller.io/connect/connect.js'
      s.onload  = () => resolve()
      s.onerror = () => reject(new Error('Failed to load Teller Connect'))
      document.head.appendChild(s)
    })
  }, [])
}
