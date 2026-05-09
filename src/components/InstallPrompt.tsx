import { useInstallPrompt } from '../hooks/useInstallPrompt'

export function InstallPrompt() {
  const { install, dismiss, showAndroidPrompt, showIOSInstructions } = useInstallPrompt()

  if (!showAndroidPrompt && !showIOSInstructions) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-surface border-b border-border px-4 py-3 flex items-center gap-3 shadow-card">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text">Install Budget</p>
        {showIOSInstructions ? (
          <p className="text-xs text-muted mt-0.5">
            Tap <span className="text-accent font-medium">Share</span> then "Add to Home Screen"
          </p>
        ) : (
          <p className="text-xs text-muted mt-0.5">
            Add to your home screen for faster access
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {showAndroidPrompt && (
          <button onClick={install} className="btn-primary text-xs px-3 py-1.5">
            Install
          </button>
        )}
        <button onClick={dismiss} className="btn text-xs px-2 py-1.5">
          Dismiss
        </button>
      </div>
    </div>
  )
}
