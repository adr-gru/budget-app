import { useState } from 'react'
import { useAddAccount } from '../../data/accounts'
import {
  usePlaidExchange,
  useLinkAccountToPlaid,
  usePlaidLinkTokenImperative,
  usePlaidSync,
  useLoadPlaidLink,
} from '../../data/plaid'
import { useUpdateBalance } from '../../data/snapshots'
import { ACCOUNT_TYPE_META } from '../../lib/accountTypes'
import { parseCents } from '../../lib/money'
import { Sheet } from '../Sheet'
import { CreditCardFields } from '../CreditCardFields'
import type { AccountType } from '../../lib/supabase'
import { AccountConfig, mapPlaidType } from './types'

export { mapPlaidType }

const MANUAL_TYPES: { value: AccountType; label: string }[] = [
  { value: 'checking',    label: 'Checking' },
  { value: 'savings',     label: 'Savings' },
  { value: 'credit_card', label: 'Credit' },
  { value: 'investment',  label: 'Investment' },
]

export function AddAccountSheet({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<'choose' | 'manual' | 'import'>('choose')

  const [name,         setName]         = useState('')
  const [type,         setType]         = useState<AccountType>('checking')
  const [limitValue,   setLimitValue]   = useState('')
  const [dueDay,       setDueDay]       = useState('')
  const [initBalance,  setInitBalance]  = useState('')
  const [savingManual, setSavingManual] = useState(false)

  const [bankLoading,     setBankLoading]     = useState(false)
  const [bankError,       setBankError]       = useState(false)
  const [plaidAccts,      setPlaidAccts]      = useState<{ id: string; name: string; type: string; subtype: string; mask: string | null }[] | null>(null)
  const [publicToken,     setPublicToken]     = useState<string | null>(null)
  const [institutionName, setInstitutionName] = useState<string | null>(null)
  const [config,          setConfig]          = useState<Record<string, AccountConfig>>({})
  const [importing,       setImporting]       = useState(false)

  const addAccount    = useAddAccount()
  const updateBalance = useUpdateBalance()
  const getLinkToken  = usePlaidLinkTokenImperative()
  const exchange      = usePlaidExchange()
  const linkToPlaid   = useLinkAccountToPlaid()
  const plaidSync     = usePlaidSync()
  const loadPlaid     = useLoadPlaidLink()

  async function submitManual(e: React.FormEvent) {
    e.preventDefault()
    setSavingManual(true)
    try {
      const newAcct = await addAccount.mutateAsync({
        name: name.trim(),
        type,
        credit_limit_cents: type === 'credit_card' && limitValue ? parseCents(limitValue) : null,
        due_day:            type === 'credit_card' && dueDay ? Number(dueDay) : null,
      })
      if (initBalance) {
        await updateBalance.mutateAsync({
          account_id:    newAcct.id,
          balance_cents: parseCents(initBalance),
          account_type:  type,
        })
      }
      onClose()
    } finally {
      setSavingManual(false)
    }
  }

  async function openBank() {
    setBankLoading(true)
    setBankError(false)
    try {
      await loadPlaid()
      const linkToken = await getLinkToken()
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: (publicTkn: string, metadata: { institution: { name: string; institution_id: string } | null; accounts: { id: string; name: string; type: string; subtype: string; mask: string | null }[] }) => {
          setPublicToken(publicTkn)
          setInstitutionName(metadata.institution?.name ?? null)
          setPlaidAccts(metadata.accounts)
          const defaults: Record<string, AccountConfig> = {}
          for (const a of metadata.accounts) {
            defaults[a.id] = { checked: true, nickname: a.name, limitValue: '', dueDay: '' }
          }
          setConfig(defaults)
          setView('import')
        },
        onExit: () => { setBankLoading(false) },
      })
      handler.open()
    } catch {
      setBankError(true)
      setBankLoading(false)
    }
  }

  function updateConfig(id: string, patch: Partial<AccountConfig>) {
    setConfig(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function confirmImport() {
    if (!plaidAccts || !publicToken) return
    setImporting(true)
    try {
      const { plaid_item_db_id } = await exchange.mutateAsync({
        public_token:     publicToken,
        institution_name: institutionName,
      })
      for (const pa of plaidAccts) {
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
          plaid_item_db_id,
          institution_name: institutionName,
        })
      }
      await plaidSync.mutateAsync()
      onClose()
    } finally {
      setImporting(false)
    }
  }

  // ── Import review view ──
  if (view === 'import' && plaidAccts) {
    const selectedCount = plaidAccts.filter(a => config[a.id]?.checked).length
    return (
      <Sheet onClose={onClose} title="Import accounts" maxHeight="90vh">
        <div className="px-5 pb-5">
          {institutionName && (
            <p className="text-sm text-muted mb-4">
              Found {plaidAccts.length} account{plaidAccts.length !== 1 ? 's' : ''} at{' '}
              <strong className="text-text">{institutionName}</strong>
            </p>
          )}
          <div className="flex flex-col gap-3 mb-5">
            {plaidAccts.map(pa => {
              const cfg     = config[pa.id] ?? { checked: true, nickname: pa.name, limitValue: '', dueDay: '' }
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
        </div>
      </Sheet>
    )
  }

  // ── Manual form view ──
  if (view === 'manual') {
    return (
      <Sheet onClose={onClose} title="Add manually" maxHeight="90vh">
        <form onSubmit={submitManual} className="px-5 pb-5 flex flex-col gap-4">
          <div>
            <label className="text-xs text-muted block mb-1.5">Nickname</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="e.g. Chase Checking"
              className="field"
            />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1.5">Type</label>
            <div className="grid grid-cols-4 gap-1.5">
              {MANUAL_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                    type === t.value
                      ? 'bg-accent text-white'
                      : 'bg-elev text-muted hover:text-text'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {type === 'credit_card' && (
            <CreditCardFields
              limitValue={limitValue} dueDay={dueDay}
              onLimitChange={setLimitValue} onDueChange={setDueDay}
            />
          )}

          <div>
            <label className="text-xs text-muted block mb-1.5">
              Starting balance <span className="text-muted/60">(optional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
              <input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={initBalance} onChange={e => setInitBalance(e.target.value)}
                placeholder="0.00" className="field pl-7"
              />
            </div>
          </div>

          <button type="submit" disabled={savingManual || !name.trim()} className="btn-primary py-3 mt-1">
            {savingManual ? 'Adding…' : 'Add account'}
          </button>
        </form>
      </Sheet>
    )
  }

  // ── Choose view (default) ──
  return (
    <Sheet onClose={onClose} title="Add account" maxHeight="55vh">
      <div className="px-5 pb-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setView('manual')}
          className="card px-4 py-4 flex items-center gap-4 text-left hover:bg-elev/40 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-elev flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Add manually</p>
            <p className="text-xs text-muted mt-0.5">Enter balances yourself — works with any bank</p>
          </div>
        </button>

        <button
          type="button"
          onClick={openBank}
          disabled={bankLoading}
          className="card px-4 py-4 flex items-center gap-4 text-left hover:bg-elev/40 transition-colors disabled:opacity-60"
        >
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">
              {bankLoading ? 'Connecting…' : 'Connect bank'}
            </p>
            <p className="text-xs text-muted mt-0.5">Auto-sync balances via Plaid</p>
          </div>
        </button>

        {bankError && (
          <p className="text-sm text-danger">Could not load Plaid. Check your connection and try again.</p>
        )}
      </div>
    </Sheet>
  )
}
