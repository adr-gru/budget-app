import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAddTransaction } from '../data/transactions'
import { CATEGORIES, CATEGORY_META } from '../lib/categories'
import { parseCents } from '../lib/money'
import { thisWeekStart, todayISO } from '../lib/week'
import type { Category } from '../lib/supabase'

function isValidCategory(value: string | null): value is Category {
  return value !== null && (CATEGORIES as string[]).includes(value)
}

export function AddTransaction() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const rawCat = params.get('category')
  const defaultCat: Category = isValidCategory(rawCat) ? rawCat : 'food_groceries'

  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<Category>(defaultCat)
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const ws = thisWeekStart()
  const add = useAddTransaction(ws)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const cents = parseCents(amount)
    if (cents <= 0) {
      setError('Enter a valid amount')
      return
    }
    setError(null)
    try {
      await add.mutateAsync({ amount_cents: cents, category, occurred_on: date, note })
      navigate('/')
    } catch {
      setError('Failed to save. Try again.')
    }
  }

  return (
    <div className="pb-24">
      <div className="px-4 pt-12 pb-4 border-b border-border">
        <h1 className="text-lg font-semibold text-text">Add transaction</h1>
      </div>

      <form onSubmit={submit} className="px-4 pt-5 flex flex-col gap-5">
        <div>
          <label className="block text-xs text-muted mb-1.5">Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
              className="field pl-7 text-lg font-medium tabular-nums"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1.5">Category</label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map(cat => {
              const meta = CATEGORY_META[cat]
              const active = cat === category
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-md border text-sm font-medium transition-colors text-left ${
                    active
                      ? 'border-subtle bg-elev text-text'
                      : 'border-border bg-bg text-subtle hover:border-subtle hover:text-text'
                  }`}
                >
                  <span style={{ color: meta.color }}>{meta.icon}</span>
                  <span className="truncate">{meta.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="field"
            required
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1.5">Note <span className="text-muted/50">(optional)</span></label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Whole Foods"
            className="field"
            maxLength={120}
          />
        </div>

        {error && <p className="text-danger text-xs">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => navigate(-1)} className="btn flex-1">
            Cancel
          </button>
          <button type="submit" disabled={add.isPending} className="btn-primary flex-1">
            {add.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
