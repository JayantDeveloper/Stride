import { useEffect, useState } from 'react'
import { Spinner } from './components/shared/Spinner'
import { Toast } from './components/shared/Toast'
import { ToastProvider } from './context/ToastContext'
import WorkspacePage from './pages/WorkspacePage'
import CalendarPage from './pages/CalendarPage'
import SettingsPage from './pages/SettingsPage'
import AuthPage from './pages/AuthPage'
import { useAuthSession } from './hooks/useAuthSession'

const TABS = [
  { id: 'workspace', label: 'Tasks' },
  { id: 'calendar',  label: 'Calendar' },
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
            className="flex-shrink-0 flex items-center px-4 h-11"
            style={{ borderBottom: '1px solid var(--color-notion-border)' }}
          >
            <div className="flex items-center gap-2 w-36 flex-shrink-0">
              <span className="text-sm font-semibold text-notion-text tracking-tight">Stride</span>
            </div>

            <div className="flex-1 flex items-center justify-center">
              <div
                className="flex rounded-lg overflow-hidden"
                style={{ background: 'var(--color-notion-surface)', border: '1px solid var(--color-notion-border)' }}
              >
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTab(t.id); setShowSettings(false) }}
                    className={`px-5 py-1.5 text-sm font-medium transition-colors ${
                      tab === t.id && !showSettings
                        ? 'text-notion-text'
                        : 'text-notion-muted hover:text-notion-text'
                    }`}
                    style={tab === t.id && !showSettings ? { background: 'var(--color-notion-hover)' } : {}}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-36 flex justify-end flex-shrink-0">
              <button
                onClick={() => setShowSettings(p => !p)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-2xl transition-colors ${
                  showSettings ? 'text-notion-text bg-notion-hover' : 'text-notion-muted hover:text-notion-text hover:bg-notion-hover'
                }`}
                title="Settings"
              >
                ⚙
              </button>
            </div>
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
                <div className={tab === 'calendar' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
                  <CalendarPage onRouteRecoverySprintToWorkspace={routeRecoverySprintToWorkspace} />
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
