import { lazy, Suspense, useEffect, useState } from 'react'
import { Spinner } from './components/shared/Spinner'
import { Toast } from './components/shared/Toast'
import { ToastProvider } from './context/ToastContext'
import { useAuthSession } from './hooks/useAuthSession'

const FocusPage     = lazy(() => import('./pages/FocusPage'))
const MatrixPage    = lazy(() => import('./pages/MatrixPage'))
const CalendarPage  = lazy(() => import('./pages/CalendarPage'))
const PlansPage     = lazy(() => import('./pages/PlansPage'))
const FoodPage      = lazy(() => import('./pages/FoodPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const SettingsPage  = lazy(() => import('./pages/SettingsPage'))
const AuthPage      = lazy(() => import('./pages/AuthPage'))

const TABS = [
  { id: 'focus',     label: 'Focus' },
  { id: 'calendar',  label: 'Calendar' },
  { id: 'matrix',    label: 'Matrix' },
  { id: 'plans',     label: 'Plans' },
  { id: 'food',      label: 'Food' },
  { id: 'analytics', label: 'Analytics' },
]

const DEFAULT_TAB = 'focus'

const PageFallback = () => (
  <div className="flex-1 flex items-center justify-center">
    <Spinner size="lg" />
  </div>
)

export default function App() {
  const auth = useAuthSession()
  const [tab, setTab] = useState(DEFAULT_TAB)
  const [visited, setVisited] = useState(new Set([DEFAULT_TAB]))
  const [showSettings, setShowSettings] = useState(() => new URLSearchParams(window.location.search).get('settings') === '1')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('settings') !== '1') return

    params.delete('settings')
    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', nextUrl)
  }, [])

  return (
    <ToastProvider>
      {auth.loading ? (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-notion-bg)', color: 'var(--color-notion-text)' }}>
          <Spinner size="lg" />
        </div>
      ) : !auth.session?.user ? (
        <>
          <AuthPage
            actionLoading={auth.actionLoading}
            error={auth.error}
            onSignIn={auth.signInWithEmail}
            onSignUp={auth.signUpWithEmail}
            onGoogleSignIn={auth.signInWithGoogle}
          />
          <Toast />
        </>
      ) : (
        <div
          className="flex flex-col h-screen w-screen overflow-hidden"
          style={{ background: 'var(--color-notion-bg)', color: 'var(--color-notion-text)' }}
        >
          <header
            className="flex-shrink-0 flex items-center gap-6 px-4 h-10"
            style={{ borderBottom: '1px solid var(--color-notion-border)' }}
          >
            <span className="text-xs font-semibold tracking-widest text-indigo-600 uppercase select-none">Stride</span>

            <nav className="flex items-center gap-1 flex-1">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setVisited(prev => new Set([...prev, t.id])); setShowSettings(false) }}
                  className={`px-3 py-1 rounded-md text-sm transition-colors ${
                    tab === t.id && !showSettings
                      ? 'text-notion-text bg-notion-hover font-medium'
                      : 'text-notion-muted hover:text-notion-text'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            <button
              onClick={() => setShowSettings(p => !p)}
              className={`w-7 h-7 flex items-center justify-center rounded-md text-lg transition-colors ${
                showSettings ? 'text-notion-text bg-notion-hover' : 'text-notion-muted hover:text-notion-text hover:bg-notion-hover'
              }`}
              title="Settings"
            >
              ⚙
            </button>
          </header>

          <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <Suspense fallback={<PageFallback />}>
            {showSettings ? (
              <div className="flex-1 overflow-y-auto">
                <SettingsPage session={auth.session} onSignOut={auth.signOut} />
              </div>
            ) : (
              <>
                {visited.has('focus') && (
                  <div className={tab === 'focus' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
                    <FocusPage />
                  </div>
                )}
                {visited.has('matrix') && (
                  <div className={tab === 'matrix' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
                    <MatrixPage />
                  </div>
                )}
                {visited.has('plans') && (
                  <div className={tab === 'plans' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
                    <PlansPage />
                  </div>
                )}
                <div className={tab === 'calendar' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
                  <CalendarPage />
                </div>
                {visited.has('food') && (
                  <div className={tab === 'food' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
                    <FoodPage />
                  </div>
                )}
                {visited.has('analytics') && (
                  <div className={tab === 'analytics' ? 'flex-1 min-h-0 overflow-y-auto' : 'hidden'}>
                    <AnalyticsPage />
                  </div>
                )}
              </>
            )}
            </Suspense>
          </main>

          <Toast />
        </div>
      )}
    </ToastProvider>
  )
}
