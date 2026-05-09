import { useState, useEffect } from 'react'
import {
  useSubscriptions, useAddSubscription, useUpdateSubscription,
  useDeactivateSubscription, advanceNextCharge, monthlyEquivalentCents,
  useSuggestedSubscriptions
} from '../data/subscriptions'
import { SubscriptionRow } from '../components/SubscriptionRow'
import { BUCKETS, BUCKET_META } from '../lib/buckets'
import { formatMoney, parseCents, formatDollars } from '../lib/money'
import type { Bucket, SubCadence, Subscription } from '../lib/supabase'
import type { SuggestedSubscription } from '../data/subscriptions'

const CADENCE_OPTIONS: { value: SubCadence; label: string }[] = [
  { value: 'weekly',  label: 'Weekly'  },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly',  label: 'Yearly'  }
]

export function Subscriptions() {
  const { data: subs = [] } = useSubscriptions()
  const updateSub   = useUpdateSubscription()
  const suggestions = useSuggestedSubscriptions()
  const addSub      = useAddSubscription()

  const [editTarget, setEditTarget] = useState<Subscription | null>(null)
  const deactivate = useDeactivateSubscription()

  async function handleAddSuggestion(s: SuggestedSubscription) {
    await addSub.mutateAsync({
      name:           s.name,
      amount_cents:   s.amount_cents,
      cadence:        s.cadence,
      next_charge_on: s.next_charge_on,
      bucket:         s.bucket === 'uncategorized' ? 'wants' : (s.bucket as Bucket)
    })
  }

  // Auto-advance overdue subscriptions on mount
  useEffect(() => {
    subs.forEach(s => {
      const advanced = advanceNextCharge(s)
      if (advanced !== s.next_charge_on) {
        updateSub.mutate({ id: s.id, next_charge_on: advanced })
      }
    })
  }, [subs.length]) // only re-run when the count changes, not on every update

  const monthlyTotal = subs.reduce((sum, s) => sum + monthlyEquivalentCents(s), 0)

  const subsByBucket = BUCKETS.reduce((acc, b) => {
    acc[b] = subs.filter(s => s.bucket === b)
    return acc
  }, {} as Record<Bucket, Subscription[]>)

  async function handleDelete(id: string) {
    if (!confirm('Remove this subscription?')) return
    await deactivate.mutateAsync(id)
  }

  return (
    <div className="pb-24">
      <div className="px-4 pt-12 pb-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text">Subscriptions</h1>
          {monthlyTotal > 0 && (
            <p className="text-xs text-muted mt-0.5">{formatMoney(monthlyTotal)}/mo total</p>
          )}
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="px-4 pt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted uppercase tracking-wider">Detected recurring</p>
          </div>
          <div className="card px-4 py-0">
            {suggestions.map((s, idx) => (
              <div
                key={s.name}
                className={`flex items-center gap-3 py-3 ${idx < suggestions.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text truncate">{s.name}</p>
                  <p className="text-xs text-muted mt-0.5 capitalize">
                    {formatMoney(s.amount_cents)} · {s.cadence} · {s.occurrences}× seen
                  </p>
                </div>
                <button
                  onClick={() => handleAddSuggestion(s)}
                  disabled={addSub.isPending}
                  className="btn text-xs py-1 px-3 flex-shrink-0"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {subs.length === 0 && suggestions.length === 0 && (
        <div className="px-4 pt-5">
          <div className="card px-4 py-4 text-center">
            <p className="text-sm text-subtle">No subscriptions yet.</p>
            <p className="text-xs text-muted mt-1">Import transactions to detect recurring subscriptions automatically.</p>
          </div>
        </div>
      )}

      {BUCKETS.map(b => {
        const list = subsByBucket[b]
        if (list.length === 0) return null
        const meta = BUCKET_META[b]
        const bucketMonthly = list.reduce((sum, s) => sum + monthlyEquivalentCents(s), 0)

        return (
          <div key={b} className="px-4 pt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted uppercase tracking-wider">{meta.label}</p>
              <p className="text-xs tabular-nums font-medium" style={{ color: meta.color }}>
                {formatMoney(bucketMonthly)}/mo
              </p>
            </div>
            <div className="card px-4 py-0">
              {list.map(s => (
                <SubscriptionRow
                  key={s.id}
                  subscription={s}
                  onEdit={() => setEditTarget(s)}
                  onDelete={() => handleDelete(s.id)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {editTarget && (
        <SubscriptionSheet
          existing={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}

function SubscriptionSheet({
  existing,
  onClose
}: {
  existing: Subscription
  onClose: () => void
}) {
  const updateSub = useUpdateSubscription()

  const [name,    setName]    = useState(existing.name)
  const [amount,  setAmount]  = useState(formatDollars(existing.amount_cents))
  const [cadence, setCadence] = useState<SubCadence>(existing.cadence)
  const [bucket,  setBucket]  = useState<Bucket>(existing.bucket)
  const [nextDate, setNextDate] = useState(existing.next_charge_on)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const cents = parseCents(amount)
    if (cents <= 0) return
    await updateSub.mutateAsync({
      id: existing.id,
      name: name.trim(),
      amount_cents: cents,
      cadence,
      bucket,
      next_charge_on: nextDate
    })
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border rounded-t-xl px-4 pt-5 overflow-y-auto"
        style={{ maxHeight: '90vh', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <p className="text-base font-semibold text-text mb-5">Edit subscription</p>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-muted block mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Netflix, Spotify, iCloud"
              required
              autoFocus
              className="field"
            />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="field pl-7"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1.5">Billing cycle</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CADENCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCadence(opt.value)}
                  className={`card px-3 py-2.5 text-sm text-center transition-colors ${
                    cadence === opt.value ? 'border-accent text-accent border-2' : 'text-subtle'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1.5">Budget bucket</label>
            <div className="grid grid-cols-3 gap-1.5">
              {BUCKETS.map(b => {
                const meta = BUCKET_META[b]
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBucket(b)}
                    className={`card px-3 py-2.5 text-sm text-center transition-colors ${
                      bucket === b ? 'border-2' : 'text-subtle'
                    }`}
                    style={bucket === b ? { borderColor: meta.color, color: meta.color } : {}}
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1.5">Next charge date</label>
            <input
              type="date"
              value={nextDate}
              onChange={e => setNextDate(e.target.value)}
              required
              className="field"
            />
          </div>

          <button
            type="submit"
            disabled={updateSub.isPending || !name.trim()}
            className="btn-primary py-3 mt-1"
          >
            {updateSub.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </>
  )
}
