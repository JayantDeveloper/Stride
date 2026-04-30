import { useEffect, useState } from 'react'
import { Spinner } from './components/shared/Spinner'
import { Toast } from './components/shared/Toast'
import { ToastProvider } from './context/ToastContext'
import WorkspacePage from './pages/WorkspacePage'
import CalendarPage from './pages/CalendarPage'
import PlanningPage from './pages/PlanningPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SettingsPage from './pages/SettingsPage'
import AuthPage from './pages/AuthPage'
import { useAuthSession } from './hooks/useAuthSession'

const TABS = [
  { id: 'workspace', label: 'Tasks' },
  { id: 'plan',      label: 'Plan' },
  { id: 'calendar',  label: 'Calendar' },
  { id: 'analytics', label: 'Analytics' },
]

export default function App() {
  const auth = useAuthSession()
  const [tab, setTab] = useState('workspace')
  const [showSettings, setShowSettings] = useState(() => new URLSearchParams(window.location.search).get('settings') === '1')
  const [workspaceSprintRequest, setWorkspaceSprintRequest] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('settings') !== '1') return

    params.delete('settings')
    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', nextUrl)
  }, [])

  function routeRecoverySprintToWorkspace({ taskId, plannedMins = 10 }) {
    setShowSettings(false)
    setTab('workspace')
    setWorkspaceSprintRequest({
      id: Date.now() + Math.random(),
      taskId,
      plannedMins,
    })
  }

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
            <span className="text-xs font-semibold tracking-widest text-indigo-400 uppercase select-none">Stride</span>

            <nav className="flex items-center gap-1 flex-1">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setShowSettings(false) }}
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
            {showSettings ? (
              <div className="flex-1 overflow-y-auto">
                <SettingsPage session={auth.session} onSignOut={auth.signOut} />
              </div>
            ) : (
              <>
                <div className={tab === 'workspace' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
                  <WorkspacePage
                    externalSprintRequest={workspaceSprintRequest}
                    onExternalSprintHandled={() => setWorkspaceSprintRequest(null)}
                  />
                </div>
                <div className={tab === 'plan' ? 'flex-1 min-h-0 overflow-y-auto' : 'hidden'}>
                  <PlanningPage />
                </div>
                <div className={tab === 'calendar' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
                  <CalendarPage onRouteRecoverySprintToWorkspace={routeRecoverySprintToWorkspace} />
                </div>
                <div className={tab === 'analytics' ? 'flex-1 min-h-0 overflow-y-auto' : 'hidden'}>
                  <AnalyticsPage />
                </div>
              </>
            )}
          </main>

          <Toast />
        </div>
      )}
    </ToastProvider>
  )
}
