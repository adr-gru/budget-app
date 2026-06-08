import { useState, useEffect, useRef } from 'react'

export function NumberField({
  label, hint, value, onSave, prefix, suffix,
  min, max, step = '0.01', placeholder
}: {
  label: string; hint?: string; value: string
  onSave: (raw: string) => void
  prefix?: string; suffix?: string
  min?: string; max?: string; step?: string; placeholder?: string
}) {
  const [local, setLocal] = useState(value)
  const focusRef = useRef(false)

  useEffect(() => { if (!focusRef.current) setLocal(value) }, [value])

  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text">{label}</p>
        {hint && <p className="font-mono text-xs text-muted mt-0.5 tabular-nums">{hint}</p>}
      </div>
      <div className="relative w-32 flex-shrink-0">
        {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={local}
          onChange={e => setLocal(e.target.value)}
          onFocus={() => { focusRef.current = true }}
          onBlur={() => { focusRef.current = false; if (local !== value) onSave(local) }}
          placeholder={placeholder ?? '0'}
          className={`field text-right font-mono tabular-nums text-sm ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-6' : ''}`}
        />
        {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">{suffix}</span>}
      </div>
    </div>
  )
}
