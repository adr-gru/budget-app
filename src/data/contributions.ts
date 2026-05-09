import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { GoalContribution } from '../lib/supabase'

export function useGoalContributions(goalId: string) {
  return useQuery({
    queryKey: ['contributions', goalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goal_contributions')
        .select('*')
        .eq('goal_id', goalId)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as GoalContribution[]
    },
    enabled: !!goalId
  })
}

export interface AddContributionInput {
  goal_id: string
  amount_cents: number
  occurred_on: string
  note?: string
}

export function useAddContribution() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddContributionInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('goal_contributions')
        .insert({ ...input, user_id: user.id, source: 'manual' })
        .select()
        .single()
      if (error) throw error
      return data as GoalContribution
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['contributions', vars.goal_id] })
    }
  })
}

export function useDeleteContribution() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, goalId }: { id: string; goalId: string }) => {
      const { error } = await supabase.from('goal_contributions').delete().eq('id', id)
      if (error) throw error
      return goalId
    },
    onSuccess: (goalId) => {
      qc.invalidateQueries({ queryKey: ['contributions', goalId] })
    }
  })
}
