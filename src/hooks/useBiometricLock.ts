import { useEffect, useState } from 'react'
import { isNative } from '../lib/native'

export function useBiometricLock() {
  const [locked, setLocked] = useState(false)

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
      })

      cleanup = () => handle.remove()
    }

    setup()
    return () => cleanup?.()
  }, [])

  async function unlock() {
    if (!isNative) return
    try {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
      await BiometricAuth.authenticate({ reason: 'Unlock Budget' })
      setLocked(false)
    } catch {
      // Keep locked — user can retry
    }
  }

  return { locked, unlock }
}
