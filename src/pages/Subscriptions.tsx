import { useState, useEffect } from 'react'
import {
  useSubscriptions, useAddSubscription, useUpdateSubscription,
  useDeactivateSubscription, advanceNextCharge, monthlyEquivalentCents,
  useSuggestedSubscriptions
} from '../data/subscriptions'
import { SubscriptionRow } from '../components/SubscriptionRow'
import { Sheet } from '../components/Sheet'
import { Skeleton } from '../components/Skeleton'
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
  const { data: subs = [], isLoading } = useSubscriptions()
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

  useEffect(() => {
    subs.forEach(s => {
      const advanced = advanceNextCharge(s)
      if (advanced !== s.next_charge_on) {
        updateSub.mutate({ id: s.id, next_charge_on: advanced })
      }
    })
  }, [subs.length])

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
    <div className="pb-24 lg:pb-8">
      <div className="px-4 lg:px-6 pt-6 lg:pt-8 pb-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="page-title">Subscriptions</h1>
          {monthlyTotal > 0 && (
            <p className="font-mono text-xs text-muted mt-0.5 tabular-nums">{formatMoney(monthlyTotal)}/mo total</p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 lg:px-6 pt-5 flex flex-col gap-3">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : (
        <>
          {suggestions.length > 0 && (
            <div className="px-4 lg:px-6 pt-6">
              <p className="section-label mb-3">Detected recurring</p>
              <div className="card px-4 py-0">
                {suggestions.map((s, idx) => (
                  <div
                    key={s.name}
                    className={`flex items-center gap-3 py-3.5 ${idx < suggestions.length - 1 ? 'border-b border-border' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{s.name}</p>
                      <p className="font-mono text-xs text-muted mt-0.5 tabular-nums capitalize">
                        {formatMoney(s.amount_cents)} · {s.cadence} · {s.occurrences}× seen
                      </p>
                    </div>
                    <button
                      onClick={() => handleAddSuggestion(s)}
                      disabled={addSub.isPending}
                      className="btn text-xs py-1.5 flex-shrink-0"
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {subs.length === 0 && suggestions.length === 0 && (
            <div className="px-4 lg:px-6 pt-12 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-elev flex items-center justify-center mb-4">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                  <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                  <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
              </div>
              <p className="text-base font-display font-semibold text-text mb-1">No subscriptions yet</p>
              <p className="text-sm text-muted max-w-xs">Import transactions to detect recurring subscriptions automatically.</p>
            </div>
          )}

          {BUCKETS.map(b => {
            const list = subsByBucket[b]
            if (list.length === 0) return null
            const meta = BUCKET_META[b]
            const bucketMonthly = list.reduce((sum, s) => sum + monthlyEquivalentCents(s), 0)

            return (
              <div key={b} className="px-4 lg:px-6 pt-6">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                    <p className="section-label">{meta.label}</p>
                  </div>
                  <p className="font-mono text-xs tabular-nums font-semibold" style={{ color: meta.color }}>
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
        </>
      )}

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
  existing, onClose
}: {
  existing: Subscription
  onClose: () => void
}) {
  const updateSub = useUpdateSubscription()

  const [name,     setName]     = useState(existing.name)
  const [amount,   setAmount]   = useState(formatDollars(existing.amount_cents))
  const [cadence,  setCadence]  = useState<SubCadence>(existing.cadence)
  const [bucket,   setBucket]   = useState<Bucket>(existing.bucket)
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
    <Sheet onClose={onClose} title="Edit subscription" maxHeight="90vh">
      <form onSubmit={submit} className="px-5 pb-5 flex flex-col gap-4">
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
              className="field pl-7 font-mono tabular-nums"
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
                className={`card px-3 py-2.5 text-sm text-center font-medium transition-colors hover:bg-elev/40 ${
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
                  className={`card px-3 py-2.5 text-sm text-center font-medium transition-colors hover:bg-elev/40 ${
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
    </Sheet>
  )
}
