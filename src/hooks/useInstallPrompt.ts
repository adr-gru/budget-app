import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem('install-dismissed') === '1'
  )

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function install() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setPrompt(null)
  }

  function dismiss() {
    localStorage.setItem('install-dismissed', '1')
    setDismissed(true)
    setPrompt(null)
  }

  const showAndroidPrompt = Boolean(prompt) && !dismissed && !isStandalone
  const showIOSInstructions = isIOS && !isStandalone && !dismissed

  return { install, dismiss, showAndroidPrompt, showIOSInstructions }
}
