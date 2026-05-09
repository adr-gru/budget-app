import { useState } from 'react'
import { format } from 'date-fns'
import { Sheet } from './Sheet'
import { useAddContribution } from '../data/contributions'
import { parseCents } from '../lib/money'

interface Props {
  goalId: string
  goalName: string
  onClose: () => void
}

export function ContributionSheet({ goalId, goalName, onClose }: Props) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [note, setNote] = useState('')
  const addContribution = useAddContribution()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const cents = parseCents(amount)
    if (cents <= 0) return
    await addContribution.mutateAsync({
      goal_id: goalId,
      amount_cents: cents,
      occurred_on: date,
      note: note.trim() || undefined
    })
    onClose()
  }

  return (
    <Sheet onClose={onClose} maxHeight="65vh">
      <div className="px-4 pb-4">
        <div className="mb-5">
          <p className="text-xs text-accent font-medium mb-0.5">Log contribution</p>
          <p className="text-base font-semibold text-text">{goalName}</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-muted mb-1 block">Amount</label>
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
                autoFocus
                required
                className="field pl-7 text-base tabular-nums"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="field"
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Note <span className="text-muted/60">(optional)</span></label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Monthly transfer"
              className="field"
              maxLength={200}
            />
          </div>
          <button type="submit" disabled={addContribution.isPending || !amount} className="btn-primary py-3 mt-1">
            {addContribution.isPending ? 'Saving…' : 'Log contribution'}
          </button>
        </form>
      </div>
    </Sheet>
  )
}
