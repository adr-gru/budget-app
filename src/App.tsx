import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { SignIn } from './auth/SignIn'
import { AuthCallback } from './auth/AuthCallback'
import { ForgotPassword } from './auth/ForgotPassword'
import { ResetPassword } from './auth/ResetPassword'
import { Dashboard } from './pages/Dashboard'
import { Accounts } from './pages/Accounts'
import { Subscriptions } from './pages/Subscriptions'
import { Settings } from './pages/Settings'
import { History } from './pages/History'
import { Goals } from './pages/Goals'
import { Transactions } from './pages/Transactions'
import { Onboarding } from './pages/Onboarding'
import { BottomNav } from './components/BottomNav'

import { queryClient } from './lib/queryClient'
import { isSupabaseConfigured } from './lib/supabase'
import { useProfile } from './data/profile'
import { useAutoLogout } from './hooks/useAutoLogout'
import { usePushRegistration } from './hooks/usePushRegistration'
import { useBiometricLock } from './hooks/useBiometricLock'
import { BiometricLock } from './components/BiometricLock'
import { isNative } from './lib/native'

// Dynamic import — only resolves on native, never throws on web
async function hideSplash() {
  if (!isNative) return
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide()
  } catch {
    // not running in Capacitor context
  }
}

function AuthenticatedApp() {
  const { data: profile, isLoading } = useProfile()
  const { locked, unlock } = useBiometricLock()
  useAutoLogout()
  usePushRegistration()

  useEffect(() => {
    hideSplash()
  }, [])

  if (locked) return <BiometricLock onUnlock={unlock} />

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-4 h-4 rounded-full border-2 border-border border-t-accent animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return <Onboarding />
  }

  return (
    <>
      <Routes>
        <Route path="/"              element={<Dashboard />} />
        <Route path="/accounts"      element={<Accounts />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/settings"      element={<Settings />} />
        <Route path="/history"        element={<History />} />
        <Route path="/goals"          element={<Goals />} />
        <Route path="/transactions"   element={<Transactions />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*"              element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  )
}

function AppRoutes() {
  const { session, loading, recoveryPending } = useAuth()

  // Password-reset link — user has a valid session but must set a new password.
  // Short-circuit before the regular dashboard so they can't navigate away.
  if (recoveryPending) {
    return (
      <Routes>
        <Route path="*" element={<ResetPassword />} />
      </Routes>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-4 h-4 rounded-full border-2 border-border border-t-accent animate-spin" />
      </div>
    )
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/forgot"   element={<ForgotPassword />} />
        <Route path="*"              element={<SignIn />} />
      </Routes>
    )
  }

  return <AuthenticatedApp />
}

function SetupScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm card p-8 text-center">
        <p className="text-text font-medium mb-2">Supabase not configured</p>
        <p className="text-subtle text-sm mb-4">
          Copy <code className="text-accent">.env.example</code> to{' '}
          <code className="text-accent">.env.local</code> and fill in your project URL and anon key,
          then restart the dev server.
        </p>
        <p className="text-xs text-muted">
          Get your credentials at{' '}
          <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline hover:text-subtle">
            supabase.com/dashboard
          </a>
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupScreen />

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
