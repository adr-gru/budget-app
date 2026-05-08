import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase JS v2 automatically exchanges the URL hash/code on getSession().
    // Check for an existing session first; if already resolved, navigate immediately.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate('/', { replace: true })
        return
      }
      // Not yet resolved — subscribe once and navigate on SIGNED_IN, then clean up.
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN') {
          subscription.unsubscribe()
          navigate('/', { replace: true })
        }
      })
    })
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <p className="text-subtle text-sm">Signing you in…</p>
    </div>
  )
}
