export interface TellerConnectEnrollment {
  accessToken: string
  user: { id: string }
  accounts: TellerConnectAccount[]
}

export interface TellerConnectAccount {
  id:          string
  name:        string
  type:        string
  subtype:     string
  status:      string
  institution: { name: string }
  last_four:   string
}

declare global {
  interface Window {
    TellerConnect: {
      setup: (config: {
        applicationId: string
        environment?:  'production' | 'sandbox' | 'development'
        products?:     string[]
        onSuccess:     (enrollment: TellerConnectEnrollment) => void
        onExit?:       () => void
        onFailure?:    (failure: unknown) => void
      }) => { open: () => void }
    }
  }
}
