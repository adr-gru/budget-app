import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { EmailDigestSettings } from '../lib/supabase'

export function useEmailDigestSettings() {
  return useQuery({
    queryKey: ['email_digest_settings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('email_digest_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw error
      return data as EmailDigestSettings | null
    }
  })
}

export function useUpsertEmailDigestSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: Partial<Omit<EmailDigestSettings, 'user_id' | 'created_at' | 'updated_at' | 'last_sent_at'>>) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('email_digest_settings')
        .upsert(
          { user_id: user.id, ...updates, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
        .select()
        .single()
      if (error) throw error
      return data as EmailDigestSettings
    },
    onSuccess: (settings) => {
      qc.setQueryData(['email_digest_settings'], settings)
    }
  })
}
