import { useEffect } from 'react'
import { isNative } from '../lib/native'
import { supabase } from '../lib/supabase'

export function usePushRegistration() {
  useEffect(() => {
    if (!isNative) return

    let cleanup: (() => void) | undefined

    async function register() {
      const { PushNotifications } = await import('@capacitor/push-notifications')

      const perm = await PushNotifications.requestPermissions()
      if (perm.receive !== 'granted') return

      await PushNotifications.register()

      const handle = await PushNotifications.addListener('registration', async ({ value }) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await supabase.from('device_tokens').upsert(
          { token: value, platform: 'ios', user_id: user.id },
          { onConflict: 'user_id,token' }
        )
      })

      cleanup = () => handle.remove()
    }

    register()
    return () => cleanup?.()
  }, [])
}
