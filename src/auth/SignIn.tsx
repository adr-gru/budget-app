import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Mode = 'signin' | 'signup'

function validatePassword(p: string): string | null {
  if (p.length < 8) return 'At least 8 characters required'
  if (!/[a-zA-Z]/.test(p)) return 'Must include at least one letter'
  if (!/[0-9]/.test(p)) return 'Must include at least one number'
  return null
}

export function SignIn() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifyPending, setVerifyPending] = useState(false)

  const pwValidation = mode === 'signup' && password ? validatePassword(password) : null

  function switchMode(m: Mode) {
    setMode(m)
    setError(null)
    setPassword('')
    setConfirmPw('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (mode === 'signup') {
      const pwErr = validatePassword(password)
      if (pwErr) { setError(pwErr); return }
      if (password !== confirmPw) { setError('Passwords do not match'); return }
      setLoading(true)
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
      })
      setLoading(false)
      if (err) setError(err.message)
      else setVerifyPending(true)
    } else {
      setLoading(true)
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (err) setError(err.message)
    }
  }

  if (verifyPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <div className="w-full max-w-sm">
          <div className="card p-8 text-center shadow-raised">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <p className="text-text font-semibold mb-1">Check your email</p>
            <p className="text-subtle text-sm mt-1 leading-relaxed">
              We sent a verification link to <strong className="text-text">{email}</strong>.
              Click the link to activate your account.
            </p>
            <p className="text-xs text-muted mt-3 leading-relaxed">
              After verifying in your browser, return here and sign in with your email and password.
            </p>
            <button
              onClick={() => { setVerifyPending(false); switchMode('signin') }}
              className="mt-5 text-sm text-accent font-medium"
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
        {/* Logo + wordmark */}
        <div className="mb-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4 shadow-raised">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <h1 className="text-text text-xl font-semibold">Budget</h1>
          <p className="text-muted text-sm mt-0.5">Personal finance dashboard</p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-elev rounded-lg p-1 mb-6">
          {(['signin', 'signup'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === m
                  ? 'bg-surface text-text shadow-card'
                  : 'text-muted hover:text-subtle'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
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

          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="field pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-subtle transition-colors"
              tabIndex={-1}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>

          {mode === 'signup' && password.length > 0 && (
            <p className={`text-xs -mt-1 ${pwValidation ? 'text-danger' : 'text-success'}`}>
              {pwValidation ?? '✓ Strong password'}
            </p>
          )}

          {mode === 'signup' && (
            <input
              type={showPw ? 'text' : 'password'}
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              placeholder="Confirm password"
              required
              autoComplete="new-password"
              className="field"
            />
          )}

          {error && <p className="text-danger text-xs">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary py-3 mt-1">
            {loading
              ? (mode === 'signup' ? 'Creating account…' : 'Signing in…')
              : (mode === 'signup' ? 'Create account' : 'Sign in')}
          </button>

          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => navigate('/auth/forgot')}
              className="text-xs text-muted hover:text-subtle transition-colors text-center py-1"
            >
              Forgot password?
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

function IconEye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}
