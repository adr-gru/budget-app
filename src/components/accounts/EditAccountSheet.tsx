import { useState } from 'react'
import { useUpdateAccount, useDeleteAccount } from '../../data/accounts'
import { ACCOUNT_TYPE_META, isLinked } from '../../lib/accountTypes'
import { parseCents } from '../../lib/money'
import { Sheet } from '../Sheet'
import { ConfirmSheet } from '../ConfirmSheet'
import type { Account } from '../../lib/supabase'

export function EditAccountSheet({
  account, onConnectBank, onClose
}: {
  account: Account
  onConnectBank: () => void
  onClose: () => void
}) {
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()
  const meta          = ACCOUNT_TYPE_META[account.type]
  const linked        = isLinked(account)
  const institution   = account.plaid_institution_name ?? account.teller_institution_name

  const [name,             setName]             = useState(account.name)
  const [limitValue,       setLimitValue]       = useState(
    account.credit_limit_cents ? String(account.credit_limit_cents / 100) : ''
  )
  const [dueDay,           setDueDay]           = useState(account.due_day ? String(account.due_day) : '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await updateAccount.mutateAsync({
      id:                 account.id,
      name:               name.trim(),
      credit_limit_cents: account.type === 'credit_card' && limitValue ? parseCents(limitValue) : account.credit_limit_cents,
      due_day:            account.type === 'credit_card' && dueDay ? Number(dueDay) : account.due_day
    })
    onClose()
  }

  async function handleDisconnect() {
    await updateAccount.mutateAsync({
      id:                    account.id,
      plaid_account_id:      null,
      plaid_item_id:         null,
      plaid_institution_name: null,
      plaid_last_synced_at:  null,
    })
    onClose()
  }

  return (
    <>
      <Sheet onClose={onClose} title="Edit account" maxHeight="90vh">
        <form onSubmit={submit} className="px-5 flex flex-col gap-4 pb-2">
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: meta.color }}>{meta.label}</p>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">Nickname</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              required className="field"
            />
          </div>
          {account.type === 'credit_card' && (
            <>
              <div>
                <label className="text-xs text-muted block mb-1.5">Credit limit (optional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                  <input
                    type="number" inputMode="decimal" step="0.01" min="0"
                    value={limitValue} onChange={e => setLimitValue(e.target.value)}
                    placeholder="0.00" className="field pl-7"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted block mb-1.5">Payment due day (optional)</label>
                <input
                  type="number" inputMode="numeric" min="1" max="31"
                  value={dueDay} onChange={e => setDueDay(e.target.value)}
                  placeholder="e.g. 15" className="field"
                />
              </div>
            </>
          )}
          <button type="submit" disabled={updateAccount.isPending || !name.trim()} className="btn-primary py-3">
            {updateAccount.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        <div className="px-5 pt-2 pb-2">
          <div className="card px-4 py-3.5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text">Bank sync</p>
              {linked ? (
                <p className="text-xs text-success mt-0.5">
                  Connected{institution ? ` · ${institution}` : ''}
                </p>
              ) : (
                <p className="text-xs text-muted mt-0.5">Not linked — tap to connect via Plaid</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={onConnectBank}
                className={linked ? 'btn text-xs' : 'btn-primary text-xs'}
              >
                {linked ? 'Reconnect' : 'Connect bank'}
              </button>
              {linked && (
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  className="text-xs text-danger hover:text-danger/80 transition-colors"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 pt-1 pb-5">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={deleteAccount.isPending}
            className="w-full py-3 rounded-lg text-sm font-medium text-danger border border-danger/25 bg-danger/5 hover:bg-danger/10 transition-colors"
          >
            {deleteAccount.isPending ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </Sheet>

      {confirmingDelete && (
        <ConfirmSheet
          title="Delete account"
          message={linked
            ? `Delete "${account.name}"? This will disconnect its bank link and remove all balance history. Cannot be undone.`
            : `Delete "${account.name}"? All balance history will be removed. Cannot be undone.`
          }
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            await deleteAccount.mutateAsync(account.id)
            onClose()
          }}
          onClose={() => setConfirmingDelete(false)}
        />
      )}

      {confirmDisconnect && (
        <ConfirmSheet
          title="Disconnect bank"
          message={`Disconnect "${account.name}" from ${institution ?? 'your bank'}? The account stays but balance will no longer sync automatically.`}
          confirmLabel="Disconnect"
          destructive
          onConfirm={handleDisconnect}
          onClose={() => setConfirmDisconnect(false)}
        />
      )}
    </>
  )
}
