import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface AuthCtx {
  session: Session | null
  loading: boolean
  recoveryPending: boolean
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  session: null,
  loading: true,
  recoveryPending: false,
  signOut: async () => {}
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recoveryPending, setRecoveryPending] = useState(false)
  const qc = useQueryClient()

  async function signOut() {
    await supabase.auth.signOut()
    qc.clear()
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      setLoading(false)
      if (event === 'PASSWORD_RECOVERY') setRecoveryPending(true)
      if (event === 'SIGNED_OUT') setRecoveryPending(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <Ctx.Provider value={{ session, loading, recoveryPending, signOut }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth(): AuthCtx {
  return useContext(Ctx)
}
