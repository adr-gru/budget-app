import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { SignIn } from './auth/SignIn'
import { AuthCallback } from './auth/AuthCallback'
import { Dashboard } from './pages/Dashboard'
import { Accounts } from './pages/Accounts'
import { Subscriptions } from './pages/Subscriptions'
import { Settings } from './pages/Settings'
import { BottomNav } from './components/BottomNav'
import { queryClient } from './lib/queryClient'
import { isSupabaseConfigured } from './lib/supabase'

function AppRoutes() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-4 h-4 rounded-full border-2 border-border border-t-subtle animate-spin" />
      </div>
    )
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<SignIn />} />
      </Routes>
    )
  }

  return (
    <>
      <Routes>
        <Route path="/"              element={<Dashboard />} />
        <Route path="/accounts"      element={<Accounts />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/settings"      element={<Settings />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*"              element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  )
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
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-subtle"
          >
            supabase.com/dashboard
          </a>
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (!isSupabaseConfigured) {
    return <SetupScreen />
  }

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
