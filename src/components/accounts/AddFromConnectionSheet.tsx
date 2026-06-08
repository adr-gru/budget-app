import { useState, useEffect } from 'react'
import { useAddAccount } from '../../data/accounts'
import { useLinkAccountToPlaid, usePlaidListAccounts, usePlaidSync } from '../../data/plaid'
import { ACCOUNT_TYPE_META } from '../../lib/accountTypes'
import { parseCents } from '../../lib/money'
import { Sheet } from '../Sheet'
import { AccountConfig, mapPlaidType } from './types'

export function AddFromConnectionSheet({
  plaidItemDbId, onClose
}: {
  plaidItemDbId: string
  onClose: () => void
}) {
  const [config,    setConfig]    = useState<Record<string, AccountConfig>>({})
  const [importing, setImporting] = useState(false)

  const listAccounts = usePlaidListAccounts()
  const addAccount   = useAddAccount()
  const linkToPlaid  = useLinkAccountToPlaid()
  const plaidSync    = usePlaidSync()

  const accounts        = listAccounts.data?.accounts ?? []
  const institutionName = listAccounts.data?.institution_name ?? null

  useEffect(() => {
    listAccounts.mutate(plaidItemDbId)
  }, [plaidItemDbId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (accounts.length === 0 || Object.keys(config).length > 0) return
    const defaults: Record<string, AccountConfig> = {}
    for (const a of accounts) {
      defaults[a.id] = { checked: true, nickname: a.name, limitValue: '', dueDay: '' }
    }
    setConfig(defaults)
  }, [accounts]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateConfig(id: string, patch: Partial<AccountConfig>) {
    setConfig(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function confirmImport() {
    setImporting(true)
    try {
      for (const pa of accounts) {
        const cfg = config[pa.id]
        if (!cfg?.checked) continue
        const acctType = mapPlaidType(pa.type, pa.subtype)
        const newAcct  = await addAccount.mutateAsync({
          name:               cfg.nickname.trim() || pa.name,
          type:               acctType,
          credit_limit_cents: acctType === 'credit_card' && cfg.limitValue ? parseCents(cfg.limitValue) : null,
          due_day:            acctType === 'credit_card' && cfg.dueDay ? Number(cfg.dueDay) : null,
        })
        await linkToPlaid.mutateAsync({
          account_id:       newAcct.id,
          plaid_account_id: pa.id,
          plaid_item_db_id: plaidItemDbId,
          institution_name: institutionName,
        })
      }
      await plaidSync.mutateAsync()
      onClose()
    } finally {
      setImporting(false)
    }
  }

  const selectedCount = accounts.filter(a => config[a.id]?.checked).length

  return (
    <Sheet onClose={onClose} title="Add accounts" maxHeight="90vh">
      <div className="px-5 pb-5">
        {listAccounts.isPending && (
          <div className="flex flex-col gap-3 mb-5">
            <div className="h-24 rounded-xl bg-elev animate-pulse" />
            <div className="h-24 rounded-xl bg-elev animate-pulse" />
          </div>
        )}

        {listAccounts.isError && (
          <p className="text-sm text-danger mb-4">Could not load accounts. Try again.</p>
        )}

        {listAccounts.isSuccess && accounts.length === 0 && (
          <p className="text-sm text-muted">All accounts from this connection are already imported.</p>
        )}

        {listAccounts.isSuccess && accounts.length > 0 && (
          <>
            {institutionName && (
              <p className="text-sm text-muted mb-4">
                {accounts.length} available account{accounts.length !== 1 ? 's' : ''} at{' '}
                <strong className="text-text">{institutionName}</strong>
              </p>
            )}
            <div className="flex flex-col gap-3 mb-5">
              {accounts.map(pa => {
                const cfg      = config[pa.id] ?? { checked: true, nickname: pa.name, limitValue: '', dueDay: '' }
                const acctType = mapPlaidType(pa.type, pa.subtype)
                return (
                  <div
                    key={pa.id}
                    className={`card px-4 py-3 transition-opacity ${cfg.checked ? '' : 'opacity-50'}`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <button
                        type="button"
                        onClick={() => updateConfig(pa.id, { checked: !cfg.checked })}
                        className={`w-5 h-5 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border-2 transition-colors ${
                          cfg.checked ? 'bg-accent border-accent' : 'border-border'
                        }`}
                      >
                        {cfg.checked && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted capitalize">
                          {pa.subtype.replace(/_/g, ' ')}{pa.mask ? ` ····${pa.mask}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold" style={{ color: ACCOUNT_TYPE_META[acctType].color }}>
                        {ACCOUNT_TYPE_META[acctType].label}
                      </span>
                    </div>
                    {cfg.checked && (
                      <div className="flex flex-col gap-2 pl-8">
                        <div>
                          <label className="text-xs text-muted block mb-1">Nickname</label>
                          <input
                            type="text"
                            value={cfg.nickname}
                            onChange={e => updateConfig(pa.id, { nickname: e.target.value })}
                            className="field text-sm"
                            placeholder={pa.name}
                          />
                        </div>
                        {acctType === 'credit_card' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-muted block mb-1">Credit limit</label>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">$</span>
                                <input
                                  type="number" inputMode="decimal" step="0.01" min="0"
                                  value={cfg.limitValue}
                                  onChange={e => updateConfig(pa.id, { limitValue: e.target.value })}
                                  placeholder="0.00" className="field text-sm pl-6"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-muted block mb-1">Due day</label>
                              <input
                                type="number" inputMode="numeric" min="1" max="31"
                                value={cfg.dueDay}
                                onChange={e => updateConfig(pa.id, { dueDay: e.target.value })}
                                placeholder="e.g. 15" className="field text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <button
              onClick={confirmImport}
              disabled={selectedCount === 0 || importing}
              className="btn-primary w-full py-3"
            >
              {importing
                ? 'Importing…'
                : selectedCount === 0
                ? 'Select at least one account'
                : `Import ${selectedCount} account${selectedCount !== 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}
