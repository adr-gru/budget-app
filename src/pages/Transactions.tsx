import { useState, useMemo, useEffect, useRef } from 'react'
import { format, parseISO, isToday, isYesterday, differenceInHours } from 'date-fns'
import { useTransactions, useUpdateTransaction } from '../data/transactions'
import { usePlaidImportTransactions, usePlaidSync } from '../data/plaid'
import { useAccounts } from '../data/accounts'
import { useTransactionRules, useAddRule, applyRulesToTransactions } from '../data/transactionRules'
import { Sheet } from '../components/Sheet'
import { Skeleton } from '../components/Skeleton'
import { formatMoney } from '../lib/money'
import type { Transaction, TransactionBucket } from '../lib/supabase'

const BUCKET_META: Record<TransactionBucket, { label: string; color: string }> = {
  needs:         { label: 'Needs',         color: '#3B82F6' },
  wants:         { label: 'Wants',         color: '#8B5CF6' },
  savings:       { label: 'Savings',       color: '#16A34A' },
  uncategorized: { label: 'Uncategorized', color: '#6B7280' },
}

type SortMode = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'date-desc',   label: 'Newest'  },
  { value: 'date-asc',    label: 'Oldest'  },
  { value: 'amount-desc', label: 'Highest' },
  { value: 'amount-asc',  label: 'Lowest'  },
]

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

const BUCKET_FILTERS: Array<{ value: TransactionBucket | 'all'; label: string }> = [
  { value: 'all',           label: 'All'           },
  { value: 'needs',         label: 'Needs'         },
  { value: 'wants',         label: 'Wants'         },
  { value: 'savings',       label: 'Savings'       },
  { value: 'uncategorized', label: 'Uncategorized' },
]

interface PendingRule {
  merchantName: string
  bucket: 'needs' | 'wants' | 'savings'
}

export function Transactions() {
  const { data: transactions = [], isLoading } = useTransactions()
  const { data: accounts = [] }                = useAccounts()
  const { data: rules = [] }                   = useTransactionRules()
  const importTx   = usePlaidImportTransactions()
  const plaidSync  = usePlaidSync()
  const addRule    = useAddRule()

  const [editing,     setEditing]     = useState<Transaction | null>(null)
  const [pendingRule, setPendingRule] = useState<PendingRule | null>(null)
  const [isSyncing,   setIsSyncing]   = useState(false)

  const [search,       setSearch]       = useState('')
  const [bucketFilter, setBucketFilter] = useState<TransactionBucket | 'all'>('all')
  const [sortMode,     setSortMode]     = useState<SortMode>('date-desc')
  const [sortOpen,     setSortOpen]     = useState(false)

  const accountMap = new Map(accounts.map(a => [a.id, a.name]))
  const hasLinked  = accounts.some(a => a.plaid_item_id)

  const syncFiredRef = useRef(false)

  useEffect(() => {
    if (syncFiredRef.current) return
    if (accounts.length === 0) return
    if (!hasLinked) return

    syncFiredRef.current = true

    const linkedAccounts = accounts.filter(a => a.plaid_item_id)
    const syncDates = linkedAccounts
      .map(a => a.plaid_last_synced_at)
      .filter((d): d is string => d !== null)

    const isStale = syncDates.length === 0 || (() => {
      const mostRecent = syncDates.reduce((a, b) => (a > b ? a : b))
      return differenceInHours(new Date(), parseISO(mostRecent)) > 4
    })()

    if (!isStale) return

    setIsSyncing(true)
    Promise.all([
      importTx.mutateAsync(),
      plaidSync.mutateAsync(),
    ]).finally(() => setIsSyncing(false))
  }, [accounts, hasLinked])

  useEffect(() => {
    if (!pendingRule) return
    const timer = setTimeout(() => setPendingRule(null), 8000)
    return () => clearTimeout(timer)
  }, [pendingRule])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return transactions
      .filter(tx => {
        if (bucketFilter !== 'all' && tx.bucket !== bucketFilter) return false
        if (q && !tx.description.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        switch (sortMode) {
          case 'date-desc':   return b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)
          case 'date-asc':    return a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)
          case 'amount-desc': return b.amount_cents - a.amount_cents
          case 'amount-asc':  return a.amount_cents - b.amount_cents
        }
      })
  }, [transactions, search, bucketFilter, sortMode])

  const grouped = sortMode === 'date-desc' || sortMode === 'date-asc'
    ? groupByDate(filtered)
    : [{ date: '', items: filtered }]

  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sortMode)?.label ?? 'Sort'

  function handleBucketChange(tx: Transaction, bucket: TransactionBucket) {
    if (bucket === 'uncategorized') return
    const merchantName = tx.merchant_name ?? tx.description
    setPendingRule({ merchantName, bucket: bucket as 'needs' | 'wants' | 'savings' })
  }

  async function applyRule() {
    if (!pendingRule) return
    await addRule.mutateAsync({ merchant_pattern: pendingRule.merchantName, bucket: pendingRule.bucket })
    setPendingRule(null)
    await applyRulesToTransactions([...rules, { id: '', user_id: '', created_at: '', merchant_pattern: pendingRule.merchantName, bucket: pendingRule.bucket }])
  }

  return (
    <div className="pb-24 lg:pb-8">
      <div className="px-4 lg:px-6 pt-6 lg:pt-8 pb-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="page-title">Transactions</h1>
          {isSyncing && <span className="text-xs text-muted">Syncing…</span>}
        </div>
        {hasLinked && (
          <button
            onClick={() => importTx.mutate()}
            disabled={importTx.isPending}
            className="btn-ghost text-xs gap-1.5"
          >
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={importTx.isPending ? 'animate-spin' : ''}
            >
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {importTx.isPending ? 'Syncing…' : 'Sync'}
          </button>
        )}
      </div>

      {!isLoading && transactions.length > 0 && (
        <div className="px-4 lg:px-6 pt-3 pb-2 flex flex-col gap-2.5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              >
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search transactions…"
                className="field pl-8 text-sm h-9"
              />
            </div>
            <div className="relative">
              <button
                onClick={() => setSortOpen(o => !o)}
                className="btn-ghost text-xs gap-1 h-9 px-2.5 whitespace-nowrap"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
                </svg>
                {currentSortLabel}
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-10 z-30 card py-1 min-w-[110px] shadow-lg">
                  {SORT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortMode(opt.value); setSortOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-elev/50 transition-colors ${
                        sortMode === opt.value ? 'text-accent font-semibold' : 'text-text'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {BUCKET_FILTERS.map(f => {
              const isActive = bucketFilter === f.value
              const color = f.value !== 'all' ? BUCKET_META[f.value as TransactionBucket].color : undefined
              return (
                <button
                  key={f.value}
                  onClick={() => setBucketFilter(f.value)}
                  className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                    isActive
                      ? 'border-transparent'
                      : 'border-border text-muted hover:text-text hover:border-border'
                  }`}
                  style={isActive ? {
                    background: (color ?? '#6366F1') + '20',
                    color: color ?? '#6366F1',
                    borderColor: (color ?? '#6366F1') + '40',
                  } : {}}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="px-4 lg:px-6 pt-5 flex flex-col gap-3">
          {[0,1,2,3,4].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : transactions.length === 0 ? (
        <div className="px-4 lg:px-6 pt-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-elev flex items-center justify-center mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </div>
          <p className="text-base font-display font-semibold text-text mb-1">No transactions yet</p>
          {hasLinked ? (
            <p className="text-sm text-muted">Tap Import to pull the last 30 days from your linked accounts.</p>
          ) : (
            <p className="text-sm text-muted">Connect a bank account in Accounts to start syncing transactions.</p>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-4 lg:px-6 pt-12 flex flex-col items-center text-center">
          <p className="text-base font-display font-semibold text-text mb-1">No matches</p>
          <p className="text-sm text-muted">Try a different search or filter.</p>
        </div>
      ) : (
        <div className="pb-4" onClick={() => sortOpen && setSortOpen(false)}>
          {importTx.data && (
            <div className="mx-4 lg:mx-6 mt-4 px-4 py-2.5 bg-success/10 rounded-lg border border-success/20">
              <p className="text-sm text-success font-medium">
                Imported {importTx.data.imported} new transaction{importTx.data.imported !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {pendingRule && (
            <div className="mx-4 lg:mx-6 mt-4 card px-4 py-3 mb-2 flex items-center gap-3">
              <p className="text-xs text-text flex-1 min-w-0">
                Always categorize <span className="font-semibold">"{pendingRule.merchantName}"</span> as{' '}
                <span className="font-semibold">{BUCKET_META[pendingRule.bucket].label}</span>?
              </p>
              <button onClick={applyRule} className="btn-ghost text-xs flex-shrink-0">
                Apply rule
              </button>
              <button onClick={() => setPendingRule(null)} className="text-muted hover:text-text transition-colors flex-shrink-0" aria-label="Dismiss">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          {grouped.map(({ date, items }) => (
            <div key={date || 'flat'} className="px-4 lg:px-6 pt-5">
              {date && <p className="section-label mb-2.5">{dateLabel(date)}</p>}
              <div className="card px-4 py-0">
                {items.map((tx, idx) => {
                  const bm       = BUCKET_META[tx.bucket]
                  const acctName = tx.account_id ? accountMap.get(tx.account_id) : null
                  return (
                    <button
                      key={tx.id}
                      onClick={() => setEditing(tx)}
                      className={`w-full flex items-center gap-3 py-3.5 text-left hover:bg-elev/30 -mx-4 px-4 transition-colors ${
                        idx < items.length - 1 ? 'border-b border-border' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text truncate">{tx.description}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span
                            className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ color: bm.color, background: bm.color + '18' }}
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
                      <span className={`font-mono text-sm font-semibold tabular-nums flex-shrink-0 ${tx.is_income ? 'text-success' : 'text-text'}`}>
                        {tx.is_income ? '+' : ''}{formatMoney(tx.amount_cents)}
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
          onBucketChanged={handleBucketChange}
        />
      )}
    </div>
  )
}

const BUCKETS: TransactionBucket[] = ['needs', 'wants', 'savings', 'uncategorized']

function EditTransactionSheet({
  transaction, onClose, onBucketChanged
}: {
  transaction: Transaction
  onClose: () => void
  onBucketChanged: (tx: Transaction, bucket: TransactionBucket) => void
}) {
  const [bucket, setBucket] = useState<TransactionBucket>(transaction.bucket)
  const [tag,    setTag]    = useState(transaction.tag ?? '')
  const update = useUpdateTransaction()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await update.mutateAsync({ id: transaction.id, bucket, tag: tag.trim() || null })
    if (bucket !== 'uncategorized' && bucket !== transaction.bucket) {
      onBucketChanged(transaction, bucket)
    }
    onClose()
  }

  return (
    <Sheet onClose={onClose} title={transaction.description} maxHeight="70vh">
      <form onSubmit={submit} className="px-5 pb-5 flex flex-col gap-4">
        <div>
          <p className="section-label mb-2.5">Category</p>
          <div className="grid grid-cols-2 gap-1.5">
            {BUCKETS.map(b => {
              const bm = BUCKET_META[b]
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBucket(b)}
                  className={`card px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-elev/40 ${
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

        <div className="flex items-center justify-between text-xs text-muted -mt-1">
          <span>{format(parseISO(transaction.date), 'MMMM d, yyyy')}</span>
          <span className={`font-mono font-semibold tabular-nums ${transaction.is_income ? 'text-success' : ''}`}>
            {transaction.is_income ? '+' : ''}{formatMoney(transaction.amount_cents)}
          </span>
        </div>

        <button type="submit" disabled={update.isPending} className="btn-primary py-3">
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Sheet>
  )
}
