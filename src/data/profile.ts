import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/supabase'

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('profile')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw error
      return data as Profile | null
    }
  })
}

export function useUpsertProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: Partial<Omit<Profile, 'user_id' | 'updated_at'>>) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('profile')
        .upsert(
          { user_id: user.id, ...updates, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
        .select()
        .single()
      if (error) throw error
      return data as Profile
    },
    onSuccess: (profile) => {
      qc.setQueryData(['profile'], profile)
    }
  })
}
