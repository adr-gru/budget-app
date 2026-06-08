import { useState } from 'react'
import {
  usePlaidExchange,
  useLinkAccountToPlaid,
  usePlaidLinkTokenImperative,
  usePlaidSync,
  useLoadPlaidLink,
} from '../../data/plaid'
import { ACCOUNT_TYPE_META } from '../../lib/accountTypes'
import { Sheet } from '../Sheet'
import type { Account } from '../../lib/supabase'

export function ConnectBankSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState(false)
  const [plaidAccts,      setPlaidAccts]      = useState<{ id: string; name: string; subtype: string; mask: string | null }[] | null>(null)
  const [publicToken,     setPublicToken]     = useState<string | null>(null)
  const [institutionName, setInstitutionName] = useState<string | null>(null)
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [linking,         setLinking]         = useState(false)

  const getLinkToken = usePlaidLinkTokenImperative()
  const exchange     = usePlaidExchange()
  const linkToPlaid  = useLinkAccountToPlaid()
  const plaidSync    = usePlaidSync()
  const loadPlaid    = useLoadPlaidLink()

  async function openPlaid() {
    setLoading(true)
    setError(false)
    const isReconnect = Boolean(account.plaid_item_id)
    try {
      await loadPlaid()
      // Pass the existing plaid_item_id when reconnecting so Plaid uses update mode
      // (re-authenticates the existing connection instead of creating a new one)
      const linkToken = await getLinkToken(account.plaid_item_id ?? undefined)
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: async (publicTkn: string, metadata: { institution: { name: string; institution_id: string } | null; accounts: { id: string; name: string; subtype: string; mask: string | null }[] }) => {
          if (isReconnect) {
            try {
              await exchange.mutateAsync({
                public_token:     publicTkn,
                institution_name: metadata.institution?.name ?? institutionName,
              })
              await plaidSync.mutateAsync()
            } finally {
              setLoading(false)
            }
            onClose()
          } else {
            setPublicToken(publicTkn)
            setInstitutionName(metadata.institution?.name ?? null)
            setPlaidAccts(metadata.accounts)
            if (metadata.accounts.length === 1) setSelectedId(metadata.accounts[0].id)
          }
        },
        onExit: () => { setLoading(false) },
      })
      handler.open()
    } catch {
      setError(true)
      setLoading(false)
    }
  }

  async function confirmLink() {
    if (!plaidAccts || !selectedId || !publicToken) return
    setLinking(true)
    try {
      const { plaid_item_db_id } = await exchange.mutateAsync({
        public_token:     publicToken,
        institution_name: institutionName,
      })
      await linkToPlaid.mutateAsync({
        account_id:       account.id,
        plaid_account_id: selectedId,
        plaid_item_db_id,
        institution_name: institutionName,
      })
      await plaidSync.mutateAsync()
      onClose()
    } finally {
      setLinking(false)
    }
  }

  const meta = ACCOUNT_TYPE_META[account.type]

  if (plaidAccts) {
    return (
      <Sheet onClose={onClose} title="Select account" maxHeight="75vh">
        <div className="px-5 pb-5">
          <p className="text-sm text-subtle mb-4">
            Which account is <span className="font-medium text-text">"{account.name}"</span>?
          </p>
          <div className="flex flex-col gap-2 mb-4">
            {plaidAccts.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedId(a.id)}
                className={`card px-4 py-3 text-left flex items-center justify-between transition-colors hover:bg-elev/40 ${
                  selectedId === a.id ? 'border-2 border-accent' : ''
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-text">{a.name}</p>
                  <p className="text-xs text-muted mt-0.5 capitalize">
                    {a.subtype.replace(/_/g, ' ')}{a.mask ? ` ····${a.mask}` : ''}
                  </p>
                </div>
                {selectedId === a.id && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={confirmLink}
            disabled={!selectedId || linking}
            className="btn-primary w-full py-3"
          >
            {linking ? 'Linking…' : 'Link account'}
          </button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={onClose} title="Connect bank" maxHeight="55vh">
      <div className="px-5 pb-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${meta.color}18` }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">{account.name}</p>
            <p className="text-xs text-muted">{meta.label}</p>
          </div>
        </div>
        <p className="text-sm text-subtle mb-5">
          Connect via Plaid to automatically sync your balance. Your credentials go directly to your bank — they're never stored here.
        </p>
        {error ? (
          <p className="text-sm text-danger">Could not load Plaid. Check your connection and try again.</p>
        ) : (
          <button
            onClick={openPlaid}
            disabled={loading}
            className="btn-primary w-full py-3"
          >
            {loading ? 'Loading…' : 'Connect with Plaid'}
          </button>
        )}
      </div>
    </Sheet>
  )
}
