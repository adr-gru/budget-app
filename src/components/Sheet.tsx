import { useEffect, useState, useCallback, useRef } from 'react'
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

  const sheetRef    = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)
  const touchStartT = useRef(0)
  const touchLastY  = useRef(0)
  const isDragging  = useRef(false)

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

  // Touch handlers attached only to the drag handle so they never
  // conflict with scrollable content inside the sheet.
  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY
    touchStartT.current = e.timeStamp
    touchLastY.current  = e.touches[0].clientY
    isDragging.current  = true
  }

  function handleTouchMove(e: React.TouchEvent) {
    const sheet = sheetRef.current
    if (!sheet || !isDragging.current) return
    const dy = e.touches[0].clientY - touchStartY.current
    touchLastY.current = e.touches[0].clientY
    sheet.style.transition = 'none'
    sheet.style.transform  = `translateY(${Math.max(0, dy)}px)`
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const sheet    = sheetRef.current
    const backdrop = backdropRef.current
    if (!sheet || !isDragging.current) return
    isDragging.current = false

    const dy       = touchLastY.current - touchStartY.current
    const elapsed  = e.timeStamp - touchStartT.current
    const velocity = elapsed > 0 ? dy / elapsed : 0 // px/ms

    if (dy > 80 || velocity > 0.4) {
      // Slide out from current drag position, fade backdrop simultaneously
      sheet.style.transition = 'transform 240ms ease-in'
      sheet.style.transform  = 'translateY(110%)'
      if (backdrop) {
        backdrop.style.transition = 'opacity 240ms ease-in'
        backdrop.style.opacity    = '0'
      }
      setTimeout(onClose, 230)
    } else {
      // Spring snap back
      sheet.style.transition = 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)'
      sheet.style.transform  = 'translateY(0)'
      setTimeout(() => {
        if (sheetRef.current) {
          sheetRef.current.style.transition = ''
          sheetRef.current.style.transform  = ''
        }
      }, 320)
    }
  }

  function handleTouchCancel() {
    const sheet = sheetRef.current
    if (!sheet) return
    isDragging.current = false
    sheet.style.transition = 'transform 280ms ease-out'
    sheet.style.transform  = 'translateY(0)'
    setTimeout(() => {
      if (sheetRef.current) {
        sheetRef.current.style.transition = ''
        sheetRef.current.style.transform  = ''
      }
    }, 280)
  }

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
        <div
          className={`fixed inset-0 bg-black/40 z-[45] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
          onClick={close}
        />
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
        ref={backdropRef}
        className={`fixed inset-0 bg-black/40 z-[45] transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
      />
      {/* Bottom sheet */}
      <div
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border rounded-t-2xl overflow-y-auto transition-transform duration-[280ms] ease-out shadow-sheet ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight, paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {/* Drag handle — touch events live here so they never conflict with sheet scroll */}
        <div
          className="flex justify-center pt-3 pb-1 touch-none cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
        >
          <div className="w-9 h-1 bg-border rounded-full" />
        </div>
        {inner}
      </div>
    </>
  )
}
