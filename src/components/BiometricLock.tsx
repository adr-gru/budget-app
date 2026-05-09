interface Props {
  onUnlock: () => void
}

export function BiometricLock({ onUnlock }: Props) {
  return (
    <div className="fixed inset-0 z-[100] bg-bg flex flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-surface shadow-raised flex items-center justify-center">
          <IconFaceId />
        </div>
        <p className="text-base font-semibold text-text">Budget is locked</p>
        <p className="text-sm text-muted text-center px-8">
          Authenticate to access your financial data
        </p>
      </div>
      <button onClick={onUnlock} className="btn-primary px-8 py-3">
        Unlock with Face ID
      </button>
    </div>
  )
}

function IconFaceId() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
      <path d="M9 2H7a2 2 0 0 0-2 2v2"/>
      <path d="M15 2h2a2 2 0 0 1 2 2v2"/>
      <path d="M9 22H7a2 2 0 0 1-2-2v-2"/>
      <path d="M15 22h2a2 2 0 0 0 2-2v-2"/>
      <path d="M9 10v.5"/>
      <path d="M15 10v.5"/>
      <path d="M9.5 15a3.5 3.5 0 0 0 5 0"/>
      <path d="M12 10v4"/>
    </svg>
  )
}
