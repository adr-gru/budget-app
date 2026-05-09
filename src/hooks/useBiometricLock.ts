import { useCallback, useEffect, useState } from 'react'
import { isNative } from '../lib/native'

export function useBiometricLock() {
  const [locked, setLocked] = useState(false)

  const unlock = useCallback(async () => {
    if (!isNative) return
    try {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
      await BiometricAuth.authenticate({ reason: 'Unlock Budget' })
      setLocked(false)
    } catch {
      // Stay locked — user can retry by tapping the button
    }
  }, [])

  useEffect(() => {
    if (!isNative) return

    let cleanup: (() => void) | undefined

    async function setup() {
      const [{ App }, { Preferences }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/preferences')
      ])

      const handle = await App.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) return
        const { value } = await Preferences.get({ key: 'biometric_enabled' })
        if (value !== 'true') return
        setLocked(true)
        unlock()
      })

      cleanup = () => handle.remove()
    }

    setup()
    return () => cleanup?.()
  }, [unlock])

  return { locked, unlock }
}
