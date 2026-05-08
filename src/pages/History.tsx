import { useState } from 'react'
import { thisWeekStart, weekLabel, weekKey } from '../lib/week'
import { subWeeks } from 'date-fns'
import { useTransactions, useDeleteTransaction } from '../data/transactions'
import { CATEGORY_META } from '../lib/categories'
import { formatMoney } from '../lib/money'
import type { Transaction } from '../lib/supabase'

const WEEKS_TO_LOAD = 8

function WeekSection({ ws, expanded, onToggle }: { ws: Date; expanded: boolean; onToggle: () => void }) {
  const { data: txs = [], isLoading } = useTransactions(ws)
  const del = useDeleteTransaction(ws)
  const total = txs.reduce((s, t) => s + t.amount_cents, 0)

  return (
    <div className="border-b border-border">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface/50 transition-colors"
      >
        <span className="text-sm font-medium text-text">{weekLabel(ws)}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-subtle tabular-nums">{formatMoney(total)}</span>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="pb-2">
          {isLoading ? (
            <p className="px-4 py-2 text-xs text-muted">Loading…</p>
          ) : txs.length === 0 ? (
            <p className="px-4 py-2 text-xs text-muted">No transactions this week</p>
          ) : (
            txs.map(tx => (
              <TxRow key={tx.id} tx={tx} onDelete={() => del.mutate(tx.id)} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function TxRow({ tx, onDelete }: { tx: Transaction; onDelete: () => void }) {
  const meta = CATEGORY_META[tx.category]

  function handleDelete() {
    if (confirm('Delete this transaction?')) onDelete()
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 group">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-sm flex-shrink-0" style={{ color: meta.color }}>{meta.icon}</span>
        <div className="min-w-0">
          <p className="text-sm text-text truncate">{meta.label}</p>
          {tx.note && <p className="text-xs text-muted truncate">{tx.note}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        <span className="text-sm tabular-nums text-subtle">{formatMoney(tx.amount_cents)}</span>
        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-all"
          aria-label="Delete"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

export function History() {
  const now = thisWeekStart()
  const weeks: Date[] = Array.from({ length: WEEKS_TO_LOAD }, (_, i) => subWeeks(now, i + 1))

  const [expanded, setExpanded] = useState<string | null>(weekKey(weeks[0]))

  function toggle(k: string) {
    setExpanded(prev => (prev === k ? null : k))
  }

  return (
    <div className="pb-24">
      <div className="px-4 pt-12 pb-4 border-b border-border">
        <h1 className="text-lg font-semibold text-text">History</h1>
      </div>
      {weeks.map(ws => (
        <WeekSection
          key={weekKey(ws)}
          ws={ws}
          expanded={expanded === weekKey(ws)}
          onToggle={() => toggle(weekKey(ws))}
        />
      ))}
    </div>
  )
}
