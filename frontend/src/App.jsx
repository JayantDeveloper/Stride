import { useState } from 'react'
import { Toast } from './components/shared/Toast'
import { ToastProvider } from './context/ToastContext'
import WorkspacePage from './pages/WorkspacePage'
import CalendarPage from './pages/CalendarPage'
import SettingsPage from './pages/SettingsPage'

const TABS = [
  { id: 'workspace', label: 'Tasks' },
  { id: 'calendar',  label: 'Calendar' },
]

export default function App() {
  const [tab, setTab] = useState('workspace')
  const [showSettings, setShowSettings] = useState(false)
  const [workspaceSprintRequest, setWorkspaceSprintRequest] = useState(null)

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
      <div
        className="flex flex-col h-screen w-screen overflow-hidden"
        style={{ background: 'var(--color-notion-bg)', color: 'var(--color-notion-text)' }}
      >
        {/* Top bar */}
        <header
          className="flex-shrink-0 flex items-center px-4 h-11"
          style={{ borderBottom: '1px solid var(--color-notion-border)' }}
        >
          {/* App name */}
          <div className="flex items-center gap-2 w-36 flex-shrink-0">
            <span className="text-sm font-semibold text-notion-text tracking-tight">FocusLab</span>
          </div>

          {/* Tab switcher — centered */}
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

          {/* Settings icon */}
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

        {/* Page content */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {showSettings ? (
            <div className="flex-1 overflow-y-auto">
              <SettingsPage />
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
    </ToastProvider>
  )
}
