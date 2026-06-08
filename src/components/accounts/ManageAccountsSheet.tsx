import { useState, useEffect } from 'react'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { useUpdateAccount } from '../../data/accounts'
import { usePlaidItems, usePlaidRemoveItem } from '../../data/plaid'
import { ACCOUNT_TYPE_META, isLinked } from '../../lib/accountTypes'
import { Sheet } from '../Sheet'
import type { Account } from '../../lib/supabase'
import { AddFromConnectionSheet } from './AddFromConnectionSheet'
import { ConnectBankSheet } from './ConnectBankSheet'

export function ManageAccountsSheet({
  accounts, onClose, onConnectNew
}: {
  accounts: Account[]
  onClose: () => void
  onConnectNew: () => void
}) {
  const [ordered,          setOrdered]          = useState(() => [...accounts])
  const [addFromItem,      setAddFromItem]      = useState<string | null>(null)
  const [reconnectAccount, setReconnectAccount] = useState<Account | null>(null)
  const updateAccount                   = useUpdateAccount()
  const removeItem                      = usePlaidRemoveItem()
  const { data: plaidItems = [] }       = usePlaidItems()

  // Keep ordered list in sync with live accounts: preserve user's custom sort,
  // add newly appeared accounts at the end, drop removed ones.
  useEffect(() => {
    setOrdered(prev => {
      const incoming = new Map(accounts.map(a => [a.id, a]))
      const kept = prev
        .filter(a => incoming.has(a.id))
        .map(a => incoming.get(a.id)!)
      const addedIds = new Set(kept.map(a => a.id))
      const added = accounts.filter(a => !addedIds.has(a.id))
      return [...kept, ...added]
    })
  }, [accounts])

  function move(idx: number, direction: -1 | 1) {
    const to = idx + direction
    if (to < 0 || to >= ordered.length) return
    const next = [...ordered]
    ;[next[idx], next[to]] = [next[to], next[idx]]
    setOrdered(next)
    updateAccount.mutate({ id: next[idx].id, sort_order: idx })
    updateAccount.mutate({ id: next[to].id, sort_order: to })
  }

  async function handleRemove(itemId: string, institutionName: string | null, linkedCount: number) {
    const label = institutionName ?? 'this bank'
    const msg = linkedCount > 0
      ? `Remove your ${label} connection? The ${linkedCount} linked account${linkedCount !== 1 ? 's' : ''} will become manual.`
      : `Remove your ${label} connection?`
    if (!confirm(msg)) return
    await removeItem.mutateAsync(itemId)
  }

  return (
    <Sheet onClose={onClose} title="Manage accounts" maxHeight="90vh">
      <div className="px-5 pb-5 flex flex-col gap-4">

        {/* Bank connections section */}
        {plaidItems.length > 0 && (
          <div>
            <p className="section-label mb-2">Bank connections</p>
            <div className="flex flex-col gap-2">
              {plaidItems.map(item => {
                const linkedAccounts = accounts.filter(a => a.plaid_item_id === item.id)
                const linkedCount    = linkedAccounts.length
                const syncTimes  = linkedAccounts.map(a => a.plaid_last_synced_at).filter(Boolean).sort()
                const lastSynced = syncTimes[syncTimes.length - 1] ?? null
                const firstLinked    = linkedAccounts[0] ?? null
                return (
                  <div key={item.id} className="card px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">
                        {item.institution_name ?? 'Unknown bank'}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        {linkedCount} account{linkedCount !== 1 ? 's' : ''} linked
                        {lastSynced && (
                          <> · Synced {formatDistanceToNowStrict(parseISO(lastSynced), { addSuffix: true })}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {firstLinked && (
                        <button
                          type="button"
                          onClick={() => setReconnectAccount(firstLinked)}
                          className="btn text-xs"
                        >
                          Reconnect
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setAddFromItem(item.id)}
                        className="btn text-xs"
                      >
                        Add account
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(item.id, item.institution_name, linkedCount)}
                        disabled={removeItem.isPending}
                        className="text-xs text-danger hover:text-danger/80 transition-colors disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Account reorder list */}
        <div className="flex flex-col gap-2">
          {plaidItems.length > 0 && <p className="section-label">Accounts</p>}
          {ordered.map((account, i) => {
            const meta = ACCOUNT_TYPE_META[account.type]
            const linked = isLinked(account)
            const institution = account.plaid_institution_name ?? account.teller_institution_name
            return (
              <div key={account.id} className="card px-4 py-3 flex items-center gap-3">
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="p-1 text-muted disabled:opacity-25 hover:text-text transition-colors"
                    aria-label="Move up"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="18 15 12 9 6 15"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === ordered.length - 1}
                    className="p-1 text-muted disabled:opacity-25 hover:text-text transition-colors"
                    aria-label="Move down"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text truncate">{account.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: meta.color }}>
                    {meta.label}{institution ? ` · ${institution}` : ''}
                  </p>
                </div>
                {linked ? (
                  <div className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                ) : (
                  <span className="text-[10px] text-muted flex-shrink-0">manual</span>
                )}
              </div>
            )
          })}
          <button
            type="button"
            onClick={onConnectNew}
            className="card px-4 py-3 flex items-center gap-3 w-full text-left hover:bg-elev/40 transition-colors"
          >
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-accent">Add account</p>
          </button>
        </div>
      </div>

      {addFromItem && (
        <AddFromConnectionSheet
          plaidItemDbId={addFromItem}
          onClose={() => setAddFromItem(null)}
        />
      )}

      {reconnectAccount && (
        <ConnectBankSheet
          account={reconnectAccount}
          onClose={() => setReconnectAccount(null)}
        />
      )}
    </Sheet>
  )
}
