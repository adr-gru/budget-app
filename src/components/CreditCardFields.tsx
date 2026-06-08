interface Props {
  limitValue: string
  dueDay: string
  onLimitChange: (v: string) => void
  onDueChange: (v: string) => void
}

export function CreditCardFields({ limitValue, dueDay, onLimitChange, onDueChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs text-muted block mb-1.5">Credit limit</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
          <input
            type="number" inputMode="decimal" step="0.01" min="0"
            value={limitValue} onChange={e => onLimitChange(e.target.value)}
            placeholder="0.00" className="field pl-7"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted block mb-1.5">Due day</label>
        <input
          type="number" inputMode="numeric" min="1" max="31"
          value={dueDay} onChange={e => onDueChange(e.target.value)}
          placeholder="e.g. 15" className="field"
        />
      </div>
    </div>
  )
}
