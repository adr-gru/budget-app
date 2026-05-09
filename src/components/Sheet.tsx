import { useEffect, useState, useCallback } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'

interface Props {
  onClose: () => void
  children: React.ReactNode
  maxHeight?: string
  title?: string
}

export function Sheet({ onClose, children, maxHeight = '85vh', title }: Props) {
  const [visible, setVisible] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const close = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const inner = (
    <>
      {title && (
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <p className="font-display text-base font-semibold text-text">{title}</p>
          <button
            onClick={close}
            className="p-1.5 -mr-1.5 rounded-md text-muted hover:text-text hover:bg-elev transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}
      <div className={title ? '' : 'pt-1'}>
        {children}
      </div>
    </>
  )

  if (isDesktop) {
    return (
      <>
        {/* Backdrop */}
        <div
          className={`fixed inset-0 bg-black/40 z-[45] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
          onClick={close}
        />
        {/* Centered modal */}
        <div
          className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-surface rounded-xl shadow-modal w-full max-w-lg overflow-y-auto transition-all duration-200 ease-out ${
            visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          style={{ maxHeight }}
        >
          {!title && (
            <div className="flex justify-end px-5 pt-4">
              <button
                onClick={close}
                className="p-1.5 rounded-md text-muted hover:text-text hover:bg-elev transition-colors"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}
          {inner}
        </div>
      </>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-[45] transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
      />
      {/* Bottom sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border rounded-t-2xl overflow-y-auto transition-transform duration-[280ms] ease-out shadow-sheet ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight, paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 bg-border rounded-full" />
        </div>
        {inner}
      </div>
    </>
  )
}
