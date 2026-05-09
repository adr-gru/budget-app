import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`
    })
    setLoading(false)
    if (err) setError(err.message)
    else setSent(true)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <div className="w-full max-w-sm">
          <div className="card p-8 text-center shadow-raised">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <p className="font-display text-lg font-semibold text-text mb-1">Reset link sent</p>
            <p className="text-subtle text-sm mt-1 leading-relaxed">
              Check <strong className="text-text">{email}</strong> for a password reset link.
            </p>
            <button
              onClick={() => navigate('/')}
              className="mt-5 text-sm text-accent font-medium hover:text-accent/80 transition-colors"
            >
              Back to sign in
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
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-subtle transition-colors mb-6"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
          <h2 className="font-display text-2xl font-semibold text-text">Forgot password</h2>
          <p className="text-muted text-sm mt-1">Enter your email and we'll send a reset link.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email address"
            required
            autoFocus
            autoComplete="email"
            className="field"
          />
          {error && (
            <div className="px-3 py-2 bg-danger/10 border border-danger/20 rounded-md">
              <p className="text-danger text-xs">{error}</p>
            </div>
          )}
          <button type="submit" disabled={loading} className="btn-primary py-3 mt-1">
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      </div>
    </div>
  )
}
