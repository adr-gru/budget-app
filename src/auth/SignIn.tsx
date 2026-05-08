import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    })
    setLoading(false)
    if (err) {
      setError(err.message)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <div className="w-full max-w-sm">
          <div className="card p-8 text-center">
            <p className="text-text font-medium mb-1">Check your inbox</p>
            <p className="text-subtle text-sm">A secure sign-in link was sent to <span className="text-text">{email}</span></p>
            <button
              onClick={() => setSent(false)}
              className="mt-6 text-xs text-muted hover:text-subtle transition-colors"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-text text-xl font-semibold mb-1">Budget</h1>
          <p className="text-subtle text-sm">Sign in with your email to continue</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            className="field"
          />
          {error && <p className="text-danger text-xs">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary py-2.5">
            {loading ? 'Sending…' : 'Send sign-in link'}
          </button>
        </form>
      </div>
    </div>
  )
}
