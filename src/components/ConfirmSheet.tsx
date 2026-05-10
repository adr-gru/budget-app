import { useState } from 'react'
import { Sheet } from './Sheet'

interface ConfirmSheetProps {
  title: string
  message: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

export function ConfirmSheet({ title, message, confirmLabel, destructive, onConfirm, onClose }: ConfirmSheetProps) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet onClose={onClose} title={title} maxHeight="85vh">
      <div className="px-5 pb-5 flex flex-col gap-5">
        <p className="text-sm text-muted">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="btn-ghost flex-1 py-2.5"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={
              destructive
                ? 'btn flex-1 py-2.5 text-danger border-danger/25 hover:bg-danger/5'
                : 'btn-primary flex-1 py-2.5'
            }
          >
            {loading ? 'Loading…' : confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
