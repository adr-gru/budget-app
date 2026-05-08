import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

const IDLE_MS = 30 * 60 * 1000 // 30 minutes

export function useAutoLogout() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    function reset() {
      clearTimeout(timer)
      timer = setTimeout(() => supabase.auth.signOut(), IDLE_MS)
    }

    const events = ['mousedown', 'keypress', 'touchstart', 'scroll', 'pointermove']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [])
}
