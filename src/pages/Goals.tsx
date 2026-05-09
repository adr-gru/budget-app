import { useState } from 'react'
import { differenceInCalendarDays, differenceInCalendarMonths, format, formatDistanceToNow, parseISO } from 'date-fns'
import { useGoals, useAddGoal, useUpdateGoal, useDeleteGoal } from '../data/goals'
import { useAccounts } from '../data/accounts'
import { useLatestBalances } from '../data/snapshots'
import { useGoalContributions, useDeleteContribution } from '../data/contributions'
import { ContributionSheet } from '../components/ContributionSheet'
import { Sheet } from '../components/Sheet'
import { Skeleton } from '../components/Skeleton'
import { formatMoney, parseCents, formatDollars } from '../lib/money'
import { todayISO } from '../lib/cycle'
import type { Goal } from '../lib/supabase'

function paceLabel(
  currentCents: number,
  targetCents: number,
  createdAt: string,
  targetDate: string | null
): { label: string; color: string } | null {
  if (!targetDate || targetCents <= 0) return null
  const now   = new Date()
  const end   = parseISO(targetDate)
  const start = parseISO(createdAt)
  const totalDays   = differenceInCalendarDays(end, start)
  const elapsedDays = differenceInCalendarDays(now, start)
  if (totalDays <= 0 || elapsedDays <= 0) return null
  const expectedPct = Math.min(elapsedDays / totalDays, 1)
  const actualPct   = Math.min(currentCents / targetCents, 1)
  const diff = actualPct - expectedPct
  if (diff >= 0.05)  return { label: 'Ahead of pace', color: '#16A34A' }
  if (diff >= -0.05) return { label: 'On pace',        color: '#6B7280' }
  return { label: 'Behind pace', color: '#D97706' }
}

function ContributionLog({
  goalId, goalName, isLinked
}: {
  goalId: string
  goalName: string
  isLinked: boolean
}) {
  const { data: contributions = [], isLoading } = useGoalContributions(goalId)
  const deleteContribution = useDeleteContribution()
  const [showAdd, setShowAdd] = useState(false)

  async function handleDelete(id: string) {
    if (!confirm('Remove this contribution?')) return
    await deleteContribution.mutateAsync({ id, goalId })
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-subtle">Contribution history</p>
        {!isLinked && (
          <button onClick={() => setShowAdd(true)} className="text-xs text-accent font-medium hover:text-accent/80 transition-colors">
            + Add
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : contributions.length === 0 ? (
        <p className="text-xs text-muted">No contributions yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {contributions.slice(0, 6).map(c => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-subtle font-mono tabular-nums">
                  {format(parseISO(c.occurred_on), 'MMM d, yyyy')}
                </span>
                {c.note && (
                  <span className="text-xs text-muted ml-1.5 truncate">· {c.note}</span>
                )}
                {c.source === 'auto' && (
                  <span className="text-[10px] text-muted ml-1.5">auto</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="font-mono text-xs font-semibold text-success tabular-nums">
                  +{formatMoney(c.amount_cents)}
                </span>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-muted/60 hover:text-danger transition-colors p-0.5"
                  aria-label="Remove contribution"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {contributions.length > 6 && (
            <p className="text-xs text-muted mt-0.5">{contributions.length - 6} more not shown</p>
          )}
        </div>
      )}

      {showAdd && (
        <ContributionSheet
          goalId={goalId}
          goalName={goalName}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}

function GoalCard({
  goal, currentCents, onEdit, onDelete
}: {
  goal: Goal
  currentCents: number
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { data: contributions = [] } = useGoalContributions(goal.id)

  const progress = goal.target_cents > 0 ? Math.min(currentCents / goal.target_cents, 1) : 0
  const pct = Math.round(progress * 100)
  const over = currentCents >= goal.target_cents
  const remaining = goal.target_cents - currentCents

  const monthsLeft = goal.target_date
    ? differenceInCalendarMonths(parseISO(goal.target_date), new Date())
    : null

  const monthlyRequired = goal.target_date && !over && monthsLeft !== null && monthsLeft > 0
    ? Math.ceil(remaining / monthsLeft)
    : null

  const pace = paceLabel(currentCents, goal.target_cents, goal.created_at, goal.target_date)
  const lastContribution = contributions[0]

  return (
    <div className="card px-4 py-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text">{goal.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {goal.target_date && (
              <p className="text-xs text-muted">
                {over
                  ? 'Goal reached!'
                  : monthsLeft !== null && monthsLeft >= 0
                  ? `${monthsLeft} month${monthsLeft !== 1 ? 's' : ''} · ${format(parseISO(goal.target_date), 'MMM yyyy')}`
                  : `Target: ${format(parseISO(goal.target_date), 'MMM yyyy')}`
                }
              </p>
            )}
            {pace && !over && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: pace.color, background: pace.color + '18' }}>
                {pace.label}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit} className="btn-ghost p-2">
            <IconEdit />
          </button>
          <button onClick={onDelete} className="btn-ghost p-2 text-danger hover:text-danger">
            <IconTrash />
          </button>
        </div>
      </div>

      <div className="h-2 bg-elev rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: over ? '#16A34A' : '#3B82F6' }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">
          {over ? '100% complete' : `${pct}% of ${formatMoney(goal.target_cents)}`}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: over ? '#16A34A' : undefined }}>
          {formatMoney(currentCents)}
          {!over && <span className="font-mono text-xs font-normal text-muted"> / {formatMoney(goal.target_cents)}</span>}
        </span>
      </div>

      {!over && (
        <div className="flex items-center justify-between mt-1">
          {remaining > 0 && (
            <p className="font-mono text-xs text-muted tabular-nums">{formatMoney(remaining)} to go</p>
          )}
          {monthlyRequired !== null && (
            <p className="font-mono text-xs text-muted tabular-nums">{formatMoney(monthlyRequired)}/mo needed</p>
          )}
        </div>
      )}

      {lastContribution && !expanded && (
        <p className="text-xs text-muted mt-1.5">
          Last: <span className="font-mono tabular-nums">+{formatMoney(lastContribution.amount_cents)}</span> · {formatDistanceToNow(parseISO(lastContribution.occurred_on), { addSuffix: true })}
        </p>
      )}

      <button
        onClick={() => setExpanded(v => !v)}
        className="mt-2.5 text-xs text-accent font-medium hover:text-accent/80 transition-colors"
      >
        {expanded ? 'Hide history' : 'View history'}
      </button>

      {expanded && (
        <ContributionLog
          goalId={goal.id}
          goalName={goal.name}
          isLinked={!!goal.linked_account_id}
        />
      )}
    </div>
  )
}

export function Goals() {
  const { data: goals = [], isLoading } = useGoals()
  const { data: accounts = [] }         = useAccounts()
  const { data: latestBalances = [] }   = useLatestBalances()
  const deleteGoal = useDeleteGoal()

  const [showAdd,    setShowAdd]    = useState(false)
  const [editTarget, setEditTarget] = useState<Goal | null>(null)

  const balanceMap = new Map(latestBalances.map(s => [s.account_id, s.balance_cents]))

  function currentCentsFor(goal: Goal): number {
    if (goal.linked_account_id) return balanceMap.get(goal.linked_account_id) ?? 0
    return goal.current_cents
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this goal?')) return
    await deleteGoal.mutateAsync(id)
  }

  return (
    <div className="pb-24 lg:pb-8">
      <div className="px-4 lg:px-6 pt-6 lg:pt-8 pb-4 border-b border-border flex items-center justify-between">
        <h1 className="page-title">Goals</h1>
        <button onClick={() => setShowAdd(true)} className="btn text-sm gap-1.5">
          <span className="text-base leading-none">+</span> Add
        </button>
      </div>

      {isLoading ? (
        <div className="px-4 lg:px-6 pt-5 flex flex-col gap-3">
          {[0,1,2].map(i => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      ) : goals.length === 0 ? (
        <div className="px-4 lg:px-6 pt-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-elev flex items-center justify-center mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
            </svg>
          </div>
          <p className="text-base font-display font-semibold text-text mb-1">No goals yet</p>
          <p className="text-sm text-muted mb-5 max-w-xs">Set a savings target and track your progress over time.</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary px-6 py-2.5">
            Add first goal
          </button>
        </div>
      ) : (
        <div className="px-4 lg:px-6 pt-5 flex flex-col gap-3">
          {goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              currentCents={currentCentsFor(goal)}
              onEdit={() => setEditTarget(goal)}
              onDelete={() => handleDelete(goal.id)}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <GoalSheet accounts={accounts} balanceMap={balanceMap} onClose={() => setShowAdd(false)} />
      )}
      {editTarget && (
        <GoalSheet
          existing={editTarget}
          accounts={accounts}
          balanceMap={balanceMap}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}

function GoalSheet({
  existing, accounts, balanceMap, onClose
}: {
  existing?: Goal
  accounts: ReturnType<typeof useAccounts>['data'] & object[]
  balanceMap: Map<string, number>
  onClose: () => void
}) {
  const addGoal    = useAddGoal()
  const updateGoal = useUpdateGoal()

  const savingsAccounts = (accounts as { id: string; name: string; type: string }[])
    .filter(a => a.type === 'savings' || a.type === 'investment')

  const [name,       setName]       = useState(existing?.name ?? '')
  const [target,     setTarget]     = useState(existing ? formatDollars(existing.target_cents) : '')
  const [targetDate, setTargetDate] = useState(existing?.target_date ?? '')
  const [linkedId,   setLinkedId]   = useState(existing?.linked_account_id ?? '')
  const [manual,     setManual]     = useState(existing && !existing.linked_account_id ? formatDollars(existing.current_cents) : '')

  const currentFromLinked = linkedId ? (balanceMap.get(linkedId) ?? 0) : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const data = {
      name: name.trim(),
      target_cents: parseCents(target),
      target_date: targetDate || null,
      linked_account_id: linkedId || null,
      current_cents: linkedId ? 0 : parseCents(manual)
    }
    if (existing) {
      await updateGoal.mutateAsync({ id: existing.id, ...data })
    } else {
      await addGoal.mutateAsync(data)
    }
    onClose()
  }

  const isPending = addGoal.isPending || updateGoal.isPending

  return (
    <Sheet onClose={onClose} title={existing ? 'Edit goal' : 'New goal'} maxHeight="90vh">
      <form onSubmit={submit} className="px-5 flex flex-col gap-4 pb-5">
        <div>
          <label className="text-xs text-muted block mb-1.5">Goal name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Emergency fund, Vacation, New car"
            required
            autoFocus
            className="field"
          />
        </div>

        <div>
          <label className="text-xs text-muted block mb-1.5">Target amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
            <input
              type="number" inputMode="decimal" step="0.01" min="1"
              value={target} onChange={e => setTarget(e.target.value)}
              placeholder="0.00" required className="field pl-7 font-mono tabular-nums"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted block mb-1.5">Target date (optional)</label>
          <input
            type="date"
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            min={todayISO()}
            className="field"
          />
        </div>

        {savingsAccounts.length > 0 && (
          <div>
            <label className="text-xs text-muted block mb-1.5">Link to account (optional)</label>
            <p className="text-xs text-muted mb-2">Automatically tracks the balance of one of your accounts as progress.</p>
            <select value={linkedId} onChange={e => setLinkedId(e.target.value)} className="field">
              <option value="">None — track manually</option>
              {savingsAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {linkedId && currentFromLinked !== null && (
              <p className="font-mono text-xs text-muted mt-1.5 tabular-nums">
                Current balance: {formatMoney(currentFromLinked)}
              </p>
            )}
          </div>
        )}

        {!linkedId && (
          <div>
            <label className="text-xs text-muted block mb-1.5">Current amount saved</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
              <input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={manual} onChange={e => setManual(e.target.value)}
                placeholder="0.00" className="field pl-7 font-mono tabular-nums"
              />
            </div>
          </div>
        )}

        <button type="submit" disabled={isPending || !name.trim()} className="btn-primary py-3 mt-1">
          {isPending ? 'Saving…' : existing ? 'Save changes' : 'Add goal'}
        </button>
      </form>
    </Sheet>
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
