import { useState } from 'react'
import { useAccounts, getLastSyncedAt } from '../data/accounts'
import { usePlaidSync } from '../data/plaid'
import { useLatestBalances, useCycleActivitySnapshots, computeActivity } from '../data/snapshots'
import { useProfile } from '../data/profile'
import { AccountCard } from '../components/AccountCard'
import { UpdateBalanceSheet } from '../components/UpdateBalanceSheet'
import { Skeleton } from '../components/Skeleton'
import { ManageAccountsSheet } from '../components/accounts/ManageAccountsSheet'
import { AddAccountSheet } from '../components/accounts/AddAccountSheet'
import { EditAccountSheet } from '../components/accounts/EditAccountSheet'
import { ConnectBankSheet } from '../components/accounts/ConnectBankSheet'
import { currentCycleStart, todayISO } from '../lib/cycle'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META, isLinked } from '../lib/accountTypes'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { formatMoney } from '../lib/money'
import type { Account, AccountType } from '../lib/supabase'

export function Accounts() {
  const { data: accounts = [], isLoading } = useAccounts()
  const { data: latestBalances = [] }      = useLatestBalances()
  const { data: profile }                  = useProfile()
  const plaidSync                          = usePlaidSync()

  const anchor     = profile?.cycle_anchor_date ?? todayISO()
  const cycleStart = currentCycleStart(anchor)
  const { data: activitySnapshots = [] } = useCycleActivitySnapshots(cycleStart)

  const balanceMap     = new Map(latestBalances.map(s => [s.account_id, s.balance_cents]))
  const lastUpdatedMap = new Map(latestBalances.map(s => [s.account_id, s.recorded_at]))
  const activityMap    = computeActivity(activitySnapshots, cycleStart)

  const [editTarget,    setEditTarget]    = useState<Account | null>(null)
  const [balanceTarget, setBalanceTarget] = useState<Account | null>(null)
  const [connectTarget, setConnectTarget] = useState<Account | null>(null)
  const [showAdd,       setShowAdd]       = useState(false)
  const [showManage,    setShowManage]    = useState(false)

  const hasLinked = accounts.some(isLinked)

  const accountsByType = ACCOUNT_TYPES.reduce((acc, type) => {
    acc[type] = accounts.filter(a => a.type === type)
    return acc
  }, {} as Record<AccountType, Account[]>)

  const lastSyncedAt = getLastSyncedAt(accounts)

  return (
    <div className="pb-24 lg:pb-8">
      <div className="px-4 lg:px-6 pt-6 lg:pt-8 pb-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="page-title">Accounts</h1>
          {hasLinked && lastSyncedAt && (
            <p className="text-xs text-muted mt-0.5">
              Synced {formatDistanceToNowStrict(parseISO(lastSyncedAt), { addSuffix: true })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasLinked && (
            <button
              onClick={() => plaidSync.mutate()}
              disabled={plaidSync.isPending}
              className={`btn-ghost text-xs gap-1.5 ${plaidSync.isError ? 'text-danger' : ''}`}
              aria-label="Sync balances"
              title={plaidSync.isError ? 'Sync failed — tap to retry' : undefined}
            >
              <svg
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={plaidSync.isPending ? 'animate-spin' : ''}
              >
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {plaidSync.isPending ? 'Syncing…' : plaidSync.isError ? 'Retry' : 'Sync'}
            </button>
          )}
          <button onClick={() => setShowManage(true)} className="btn text-sm">
            Manage
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 lg:px-6 pt-5 flex flex-col gap-3">
          {[0,1,2].map(i => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : accounts.length === 0 ? (
        <div className="px-4 lg:px-6 pt-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-elev flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>
          <p className="text-base font-display font-semibold text-text mb-1">No accounts yet</p>
          <p className="text-sm text-muted mb-5 max-w-xs">Add accounts manually or connect your bank via Plaid to sync balances automatically.</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary px-6 py-2.5">
            Add first account
          </button>
        </div>
      ) : (
        <>
          {ACCOUNT_TYPES.map(type => {
            const list = accountsByType[type]
            if (list.length === 0) return null
            const meta  = ACCOUNT_TYPE_META[type]
            const total = list.reduce((sum, a) => sum + (balanceMap.get(a.id) ?? 0), 0)

            return (
              <div key={type} className="px-4 lg:px-6 pt-6">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                    <p className="section-label">{meta.label}</p>
                  </div>
                  <p className="font-mono text-xs tabular-nums font-semibold" style={{ color: meta.color }}>
                    {formatMoney(total)}
                  </p>
                </div>
                <div className="flex flex-col gap-2.5">
                  {list.map(a => (
                    <AccountCard
                      key={a.id}
                      account={a}
                      balance={balanceMap.get(a.id) ?? null}
                      delta={activityMap.get(a.id)?.delta ?? null}
                      lastSnapshotAt={lastUpdatedMap.get(a.id) ?? null}
                      onTap={() => isLinked(a) ? setEditTarget(a) : setBalanceTarget(a)}
                      onEdit={() => setEditTarget(a)}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          <div className="px-4 lg:px-6 pt-5">
            <button
              onClick={() => setShowAdd(true)}
              className="w-full card px-4 py-3.5 flex items-center gap-3 hover:bg-elev/40 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-accent">Add account</p>
            </button>
          </div>
        </>
      )}

      {editTarget && (
        <EditAccountSheet
          account={editTarget}
          onConnectBank={() => { setEditTarget(null); setConnectTarget(editTarget) }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {balanceTarget && (
        <UpdateBalanceSheet
          account={balanceTarget}
          currentBalance={balanceMap.get(balanceTarget.id) ?? null}
          onClose={() => setBalanceTarget(null)}
        />
      )}

      {connectTarget && (
        <ConnectBankSheet
          account={connectTarget}
          onClose={() => setConnectTarget(null)}
        />
      )}

      {showManage && (
        <ManageAccountsSheet
          accounts={accounts}
          onClose={() => setShowManage(false)}
          onConnectNew={() => { setShowManage(false); setShowAdd(true) }}
        />
      )}

      {showAdd && <AddAccountSheet onClose={() => setShowAdd(false)} />}
    </div>
  )
}
