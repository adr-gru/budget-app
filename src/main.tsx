import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { isNative } from './lib/native'
import { getTheme, applyTheme } from './lib/theme'

applyTheme(getTheme())

async function initNative() {
  if (!isNative) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')

    const updateStatusBar = async () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      await StatusBar.setStyle({ style: isDark ? Style.Light : Style.Dark })
      await StatusBar.setBackgroundColor({ color: isDark ? '#0F1117' : '#F9FAFB' })
    }

    await updateStatusBar()

    const observer = new MutationObserver(updateStatusBar)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  } catch {
    // not running in Capacitor context
  }
}

initNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
