import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface PasskeyCredential {
  id: string
  credential_id: string
  device_name: string | null
  created_at: string
}

export function usePasskeyCredentials() {
  return useQuery({
    queryKey: ['passkeys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('passkey_credentials')
        .select('id, credential_id, device_name, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as PasskeyCredential[]
    },
  })
}

export function useDeletePasskey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('passkey_credentials').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passkeys'] }),
  })
}
