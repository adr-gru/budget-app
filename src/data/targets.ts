import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Category, CategoryTarget } from '../lib/supabase'

export function useTargets() {
  return useQuery({
    queryKey: ['targets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('category_targets').select('*')
      if (error) throw error
      return data as CategoryTarget[]
    }
  })
}

export function useUpsertTarget() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ category, target_cents }: { category: Category; target_cents: number }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('category_targets')
        .upsert({ user_id: user.id, category, target_cents, updated_at: new Date().toISOString() }, {
          onConflict: 'user_id,category'
        })
        .select()
        .single()
      if (error) throw error
      return data as CategoryTarget
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['targets'] })
    }
  })
}
