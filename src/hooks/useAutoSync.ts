import { useEffect, useRef } from 'react'
import { differenceInHours, parseISO } from 'date-fns'
import { useAccounts } from '../data/accounts'
import { usePlaidImportTransactions, usePlaidSync } from '../data/plaid'

export function useAutoSync() {
  const { data: accounts = [] } = useAccounts()
  const importTx  = usePlaidImportTransactions()
  const plaidSync = usePlaidSync()
  const firedRef  = useRef(false)

  const hasLinked = accounts.some(a => a.plaid_item_id)

  useEffect(() => {
    if (firedRef.current) return
    if (accounts.length === 0) return
    if (!hasLinked) return

    firedRef.current = true

    const linkedAccounts = accounts.filter(a => a.plaid_item_id)
    const syncDates = linkedAccounts
      .map(a => a.plaid_last_synced_at)
      .filter((d): d is string => d !== null)

    const isStale = syncDates.length === 0 || (() => {
      const mostRecent = syncDates.reduce((a, b) => (a > b ? a : b))
      return differenceInHours(new Date(), parseISO(mostRecent)) > 4
    })()

    if (!isStale) return

    Promise.all([
      importTx.mutateAsync(),
      plaidSync.mutateAsync(),
    ]).catch(() => {})
  }, [accounts, hasLinked])
}
