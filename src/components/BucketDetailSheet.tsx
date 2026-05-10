import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Sheet } from './Sheet'
import { supabase } from '../lib/supabase'
import { BUCKET_META } from '../lib/buckets'
import { formatMoney } from '../lib/money'
import type { Bucket, Subscription, Transaction } from '../lib/supabase'

interface Props {
  bucket: Bucket
  cycleStart: Date
  cycleEnd: Date
  subscriptions: Subscription[]
  onClose: () => void
}

export function BucketDetailSheet({ bucket, cycleStart, cycleEnd, subscriptions, onClose }: Props) {
  const cycleStartStr = format(cycleStart, 'yyyy-MM-dd')
  const cycleEndStr   = format(cycleEnd, 'yyyy-MM-dd')

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', 'bucket-detail', bucket, cycleStartStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('bucket', bucket)
        .gte('date', cycleStartStr)
        .lte('date', cycleEndStr)
        .order('amount_cents', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as Transaction[]
    }
  })

  const bucketSubs = subscriptions.filter(s => {
    if (s.bucket !== bucket) return false
    return s.next_charge_on >= cycleStartStr && s.next_charge_on <= cycleEndStr
  })

  const txTotal   = transactions.reduce((sum, tx) => sum + tx.amount_cents, 0)
  const subTotal  = bucketSubs.reduce((sum, s) => sum + s.amount_cents, 0)
  const grandTotal = transactions.length > 0 ? txTotal : subTotal

  const meta = BUCKET_META[bucket]

  return (
    <Sheet onClose={onClose} title={meta.label} maxHeight="85vh">
      <div className="px-5 pb-5">
        <p className="text-xs text-muted mb-4 font-mono tabular-nums">
          {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
          {' · '}
          {bucketSubs.length} subscription{bucketSubs.length !== 1 ? 's' : ''}
          {' · total: '}
          {formatMoney(grandTotal)}
        </p>

        {transactions.length === 0 && bucketSubs.length === 0 && (
          <p className="text-sm text-muted text-center py-6">No activity this cycle</p>
        )}

        {transactions.length > 0 && (
          <>
            <p className="section-label mb-3">Transactions</p>
            <div className="card px-4 py-0 mb-5">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 py-3.5 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text truncate">{tx.merchant_name || tx.description}</p>
                    <p className="text-xs text-muted mt-0.5">{format(parseISO(tx.date), 'MMM d')}</p>
                  </div>
                  <span className="font-mono text-sm tabular-nums text-danger font-medium flex-shrink-0">
                    {formatMoney(tx.amount_cents)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {bucketSubs.length > 0 && (
          <>
            <p className="section-label mb-3">Subscriptions</p>
            <div className="card px-4 py-0">
              {bucketSubs.map(s => (
                <div key={s.id} className="flex items-center gap-3 py-3.5 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text truncate">{s.name}</p>
                  </div>
                  <span className="font-mono text-sm tabular-nums text-text font-medium flex-shrink-0">
                    {formatMoney(s.amount_cents)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
