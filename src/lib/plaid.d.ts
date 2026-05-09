export interface PlaidLinkAccount {
  id:                  string
  name:                string
  mask:                string | null
  type:                string
  subtype:             string
  verification_status: string | null
}

export interface PlaidLinkMetadata {
  institution:     { name: string; institution_id: string } | null
  accounts:        PlaidLinkAccount[]
  link_session_id: string
}

declare global {
  interface Window {
    Plaid: {
      create: (config: {
        token:     string
        onSuccess: (publicToken: string, metadata: PlaidLinkMetadata) => void
        onLoad?:   () => void
        onExit?:   (err: unknown, metadata: unknown) => void
        onEvent?:  (eventName: string, metadata: unknown) => void
      }) => { open: () => void; exit: () => void; destroy: () => void }
    }
  }
}
