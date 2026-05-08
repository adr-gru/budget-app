import { Subscription } from '../lib/supabase'
import { BUCKET_META } from '../lib/buckets'
import { formatMoney } from '../lib/money'
import { format, parseISO } from 'date-fns'

const CADENCE_LABEL: Record<string, string> = {
  weekly:  '/wk',
  monthly: '/mo',
  yearly:  '/yr'
}

interface Props {
  subscription: Subscription
  onEdit: () => void
  onDelete: () => void
}

export function SubscriptionRow({ subscription: s, onEdit, onDelete }: Props) {
  const bucketMeta = BUCKET_META[s.bucket]

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text truncate">{s.name}</p>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ background: bucketMeta.color + '22', color: bucketMeta.color }}
          >
            {bucketMeta.label}
          </span>
        </div>
        <p className="text-xs text-muted mt-0.5">
          Next: {format(parseISO(s.next_charge_on), 'MMM d')}
        </p>
      </div>
      <span className="text-sm font-semibold tabular-nums text-text flex-shrink-0">
        {formatMoney(s.amount_cents)}
        <span className="text-xs font-normal text-muted">{CADENCE_LABEL[s.cadence]}</span>
      </span>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onEdit} className="btn-ghost p-1.5" aria-label="Edit">
          <IconEdit />
        </button>
        <button onClick={onDelete} className="btn-ghost p-1.5 text-danger hover:text-danger" aria-label="Remove">
          <IconTrash />
        </button>
      </div>
    </div>
  )
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}
