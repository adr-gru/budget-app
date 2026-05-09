import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

function validatePassword(p: string): string | null {
  if (p.length < 8) return 'At least 8 characters required'
  if (!/[a-zA-Z]/.test(p)) return 'Must include at least one letter'
  if (!/[0-9]/.test(p)) return 'Must include at least one number'
  return null
}

export function ResetPassword() {
  const { signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const pwValidation = password ? validatePassword(password) : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const pwErr = validatePassword(password)
    if (pwErr) { setError(pwErr); return }
    if (password !== confirmPw) { setError('Passwords do not match'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) {
      setError(err.message)
    } else {
      setDone(true)
      // Sign out so recoveryPending clears and user signs in fresh with new password
      setTimeout(() => signOut(), 2000)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <div className="w-full max-w-sm">
          <div className="card p-8 text-center shadow-raised">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p className="text-text font-semibold">Password updated</p>
            <p className="text-muted text-sm mt-1">Signing you out — please sign in with your new password.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h2 className="text-text text-xl font-semibold">Set new password</h2>
          <p className="text-muted text-sm mt-1">Choose a strong password for your account.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="New password"
              required
              autoFocus
              autoComplete="new-password"
              className="field pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-subtle transition-colors"
              tabIndex={-1}
            >
              {showPw
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>
          {password.length > 0 && (
            <p className={`text-xs -mt-1 ${pwValidation ? 'text-danger' : 'text-success'}`}>
              {pwValidation ?? '✓ Strong password'}
            </p>
          )}
          <input
            type={showPw ? 'text' : 'password'}
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            placeholder="Confirm new password"
            required
            autoComplete="new-password"
            className="field"
          />
          {error && <p className="text-danger text-xs">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary py-3 mt-1">
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
