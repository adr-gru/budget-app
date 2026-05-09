import { useState } from 'react'
import { useUpsertProfile } from '../data/profile'
import { parseCents, formatMoney } from '../lib/money'
import { todayISO } from '../lib/cycle'

const TOTAL_STEPS = 4

function Dots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === step ? 'w-5 h-1.5 bg-accent' : 'w-1.5 h-1.5 bg-border'
          }`}
        />
      ))}
    </div>
  )
}

export function Onboarding() {
  const [step,       setStep]       = useState(0)
  const [paycheck,   setPaycheck]   = useState('')
  const [needsPct,   setNeedsPct]   = useState('50')
  const [wantsPct,   setWantsPct]   = useState('30')
  const [savingsPct, setSavingsPct] = useState('20')
  const [anchor,     setAnchor]     = useState(todayISO())
  const upsert = useUpsertProfile()

  const totalPct = Number(needsPct || 0) + Number(wantsPct || 0) + Number(savingsPct || 0)
  const paycheckCents = parseCents(paycheck)

  function bucketAmount(pct: string) {
    if (!paycheckCents) return ''
    const cents = Math.round(paycheckCents * Number(pct || 0) / 100)
    return formatMoney(cents)
  }

  async function finish() {
    await upsert.mutateAsync({
      paycheck_cents: paycheckCents,
      needs_pct: Math.round(Number(needsPct || 50)),
      wants_pct: Math.round(Number(wantsPct || 30)),
      savings_pct: Math.round(Number(savingsPct || 20)),
      cycle_anchor_date: anchor
    })
  }

  if (step === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-bg px-6">
        <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto w-full">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mb-6 shadow-raised">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold text-text mb-3">Take control of your finances</h1>
          <p className="text-subtle text-sm leading-relaxed mb-10">
            Track your balances, subscriptions, and budget — all in one place. Takes about 60 seconds to set up.
          </p>
          <Dots step={step} />
        </div>
        <div className="pb-12 max-w-sm mx-auto w-full">
          <button onClick={() => setStep(1)} className="btn-primary w-full py-3.5">
            Get started
          </button>
        </div>
      </div>
    )
  }

  if (step === 1) {
    return (
      <div className="min-h-screen flex flex-col bg-bg px-6">
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
          <p className="text-xs text-muted mb-2 text-center">Step 1 of 3</p>
          <h2 className="font-display text-2xl font-semibold text-text text-center mb-1">Your paycheck</h2>
          <p className="text-sm text-subtle text-center mb-8">How much do you take home each pay period?</p>

          <div className="relative mb-2">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle text-lg font-mono">$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={paycheck}
              onChange={e => setPaycheck(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="field pl-9 font-mono text-2xl py-4 tabular-nums text-center font-semibold"
            />
          </div>
          <p className="text-xs text-muted text-center mb-10">Biweekly take-home pay after taxes</p>

          <Dots step={step} />
        </div>
        <div className="pb-12 max-w-sm mx-auto w-full flex gap-3">
          <button onClick={() => setStep(0)} className="btn py-3 w-24">Back</button>
          <button
            onClick={() => setStep(2)}
            disabled={!paycheck || paycheckCents <= 0}
            className="btn-primary py-3 flex-1"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="min-h-screen flex flex-col bg-bg px-6">
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
          <p className="text-xs text-muted mb-2 text-center">Step 2 of 3</p>
          <h2 className="font-display text-2xl font-semibold text-text text-center mb-1">Your budget split</h2>
          <p className="text-sm text-subtle text-center mb-6">
            The 50/30/20 rule is a great starting point. Adjust to fit your life.
          </p>

          <div className="card px-4 py-0 mb-4">
            {[
              { label: 'Needs',   hint: 'Housing, food, essentials',     value: needsPct,   set: setNeedsPct,   color: '#3B82F6' },
              { label: 'Wants',   hint: 'Entertainment, subscriptions',  value: wantsPct,   set: setWantsPct,   color: '#8B5CF6' },
              { label: 'Savings', hint: 'Savings & investments',         value: savingsPct, set: setSavingsPct, color: '#16A34A' }
            ].map(({ label, hint, value, set, color }) => (
              <div key={label} className="flex items-center gap-3 py-3.5 border-b border-border last:border-0">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text">{label}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {hint}
                    {paycheckCents > 0 && (
                      <span style={{ color }} className="ml-1.5 font-mono tabular-nums">→ {bucketAmount(value)}</span>
                    )}
                  </p>
                </div>
                <div className="relative w-20">
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1" min="0" max="100"
                    value={value}
                    onChange={e => set(e.target.value)}
                    className="field text-right pr-6 font-mono tabular-nums text-sm"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">%</span>
                </div>
              </div>
            ))}
          </div>

          <p className={`font-mono text-xs text-center mb-8 font-semibold tabular-nums ${totalPct === 100 ? 'text-success' : 'text-danger'}`}>
            {totalPct}% allocated {totalPct !== 100 && `— needs to equal 100%`}
          </p>

          <Dots step={step} />
        </div>
        <div className="pb-12 max-w-sm mx-auto w-full flex gap-3">
          <button onClick={() => setStep(1)} className="btn py-3 w-24">Back</button>
          <button
            onClick={() => setStep(3)}
            disabled={totalPct !== 100}
            className="btn-primary py-3 flex-1"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  if (step === 3) {
    return (
      <div className="min-h-screen flex flex-col bg-bg px-6">
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
          <p className="text-xs text-muted mb-2 text-center">Step 3 of 3</p>
          <h2 className="font-display text-2xl font-semibold text-text text-center mb-1">Your last payday</h2>
          <p className="text-sm text-subtle text-center mb-8">
            This anchors your biweekly pay periods. Pick the most recent payday.
          </p>

          <input
            type="date"
            value={anchor}
            onChange={e => setAnchor(e.target.value)}
            className="field text-base text-center py-3.5 mb-10"
          />

          <Dots step={step} />
        </div>
        <div className="pb-12 max-w-sm mx-auto w-full flex gap-3">
          <button onClick={() => setStep(2)} className="btn py-3 w-24">Back</button>
          <button
            onClick={finish}
            disabled={!anchor || upsert.isPending}
            className="btn-primary py-3 flex-1"
          >
            {upsert.isPending ? 'Setting up…' : "Let's go"}
          </button>
        </div>
      </div>
    )
  }

  return null
}
