import { useState } from 'react'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { useTransactions, useUpdateTransaction } from '../data/transactions'
import { useTellerImportTransactions } from '../data/teller'
import { useAccounts } from '../data/accounts'
import { Sheet } from '../components/Sheet'
import { Skeleton } from '../components/Skeleton'
import { formatMoney } from '../lib/money'
import type { Transaction, TransactionBucket } from '../lib/supabase'

const BUCKET_META: Record<TransactionBucket, { label: string; color: string; bg: string }> = {
  needs:         { label: 'Needs',          color: '#3b82f6', bg: '#eff6ff' },
  wants:         { label: 'Wants',          color: '#a855f7', bg: '#faf5ff' },
  savings:       { label: 'Savings',        color: '#22c55e', bg: '#f0fdf4' },
  uncategorized: { label: 'Uncategorized',  color: '#8e8e93', bg: '#f5f5f7' },
}

function dateLabel(iso: string): string {
  const d = parseISO(iso)
  if (isToday(d))     return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEEE, MMM d')
}

function groupByDate(txs: Transaction[]): Array<{ date: string; items: Transaction[] }> {
  const map = new Map<string, Transaction[]>()
  for (const tx of txs) {
    const group = map.get(tx.date) ?? []
    group.push(tx)
    map.set(tx.date, group)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items }))
}

export function Transactions() {
  const { data: transactions = [], isLoading } = useTransactions()
  const { data: accounts = [] } = useAccounts()
  const importTx = useTellerImportTransactions()
  const [editing, setEditing] = useState<Transaction | null>(null)

  const accountMap = new Map(accounts.map(a => [a.id, a.name]))
  const grouped    = groupByDate(transactions)
  const hasLinked  = accounts.some(a => a.teller_enrollment_id)

  return (
    <div className="pb-24">
      <div className="px-4 pt-12 pb-4 border-b border-border flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">Transactions</h1>
        {hasLinked && (
          <button
            onClick={() => importTx.mutate()}
            disabled={importTx.isPending}
            className="btn-ghost text-xs gap-1.5 py-1.5"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={importTx.isPending ? 'animate-spin' : ''}
            >
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {importTx.isPending ? 'Importing…' : 'Import'}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="px-4 pt-5 flex flex-col gap-3">
          {[0,1,2,3,4].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : transactions.length === 0 ? (
        <div className="px-4 pt-10 text-center">
          <p className="text-sm text-subtle mb-1">No transactions yet</p>
          {hasLinked ? (
            <p className="text-xs text-muted">Tap Import to pull the last 30 days from your linked accounts.</p>
          ) : (
            <p className="text-xs text-muted">Connect a bank account in Accounts to start syncing transactions.</p>
          )}
        </div>
      ) : (
        <div className="pb-4">
          {importTx.data && (
            <div className="mx-4 mt-4 px-4 py-2 bg-success/10 rounded-lg">
              <p className="text-xs text-success font-medium">
                Imported {importTx.data.imported} new transaction{importTx.data.imported !== 1 ? 's' : ''}
              </p>
            </div>
          )}
          {grouped.map(({ date, items }) => (
            <div key={date} className="px-4 pt-5">
              <p className="text-xs text-muted mb-2 uppercase tracking-wider">{dateLabel(date)}</p>
              <div className="card px-4 py-0">
                {items.map((tx, idx) => {
                  const bm       = BUCKET_META[tx.bucket]
                  const acctName = tx.account_id ? accountMap.get(tx.account_id) : null
                  return (
                    <button
                      key={tx.id}
                      onClick={() => setEditing(tx)}
                      className={`w-full flex items-center gap-3 py-3 text-left ${
                        idx < items.length - 1 ? 'border-b border-border' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text truncate">{tx.description}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span
                            className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ color: bm.color, background: bm.bg }}
                          >
                            {bm.label}
                          </span>
                          {tx.tag && (
                            <span className="text-[10px] text-muted">{tx.tag}</span>
                          )}
                          {acctName && (
                            <span className="text-[10px] text-muted">· {acctName}</span>
                          )}
                          {tx.category_override && (
                            <span className="text-[10px] text-muted">· edited</span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-text flex-shrink-0">
                        {formatMoney(tx.amount_cents)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditTransactionSheet
          transaction={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ─── Edit Transaction Sheet ───────────────────────────────────────────────────

const BUCKETS: TransactionBucket[] = ['needs', 'wants', 'savings', 'uncategorized']

function EditTransactionSheet({
  transaction,
  onClose
}: {
  transaction: Transaction
  onClose: () => void
}) {
  const [bucket, setBucket] = useState<TransactionBucket>(transaction.bucket)
  const [tag,    setTag]    = useState(transaction.tag ?? '')
  const update = useUpdateTransaction()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await update.mutateAsync({ id: transaction.id, bucket, tag: tag.trim() || null })
    onClose()
  }

  return (
    <Sheet onClose={onClose} title={transaction.description} maxHeight="70vh">
      <form onSubmit={submit} className="px-4 pb-4 flex flex-col gap-4">
        <div>
          <p className="text-xs text-muted mb-2 uppercase tracking-wider">Category</p>
          <div className="grid grid-cols-2 gap-1.5">
            {BUCKETS.map(b => {
              const bm = BUCKET_META[b]
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBucket(b)}
                  className={`card px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    bucket === b ? 'border-2' : ''
                  }`}
                  style={bucket === b ? { borderColor: bm.color, color: bm.color } : { color: bm.color }}
                >
                  {bm.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted block mb-1.5">Tag (optional)</label>
          <input
            type="text"
            value={tag}
            onChange={e => setTag(e.target.value)}
            placeholder="e.g. groceries, commute, vacation"
            className="field"
          />
        </div>

        <div className="flex items-center justify-between text-xs text-muted -mt-2">
          <span>{format(parseISO(transaction.date), 'MMMM d, yyyy')}</span>
          <span className="font-semibold tabular-nums">{formatMoney(transaction.amount_cents)}</span>
        </div>

        <button type="submit" disabled={update.isPending} className="btn-primary py-3">
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Sheet>
  )
}
