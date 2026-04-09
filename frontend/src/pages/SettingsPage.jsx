import { Button } from '../components/shared/Button'
import { Spinner } from '../components/shared/Spinner'
import { useGoogleAuth } from '../hooks/useGoogleAuth'
import { useToast } from '../context/ToastContext'

export default function SettingsPage({ session, onSignOut }) {
  const { connected, loading, connect, disconnect } = useGoogleAuth()
  const { addToast } = useToast()

  async function handleDisconnect() {
    await disconnect()
    addToast('Google Calendar disconnected', 'info')
  }

  async function handleConnect() {
    await connect({
      callbackURL: `${window.location.origin}${window.location.pathname}?settings=1`,
    })
  }

  async function handleSignOut() {
    await onSignOut?.()
    addToast('Signed out', 'info')
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-100 mb-2">Settings</h1>
      <p className="text-sm text-gray-500 mb-8">Manage your account, login, and integrations.</p>

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Account</h2>
            <p className="text-xs text-gray-500">Signed in as {session?.user?.email ?? 'Unknown user'}</p>
            {session?.user?.name && (
              <p className="text-sm text-gray-400 mt-2">{session.user.name}</p>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={() => { void handleSignOut() }}>
            Sign out
          </Button>
        </div>
      </section>

      {/* Google Calendar */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-blue-900 flex items-center justify-center text-sm">
            📅
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-100">Google Calendar</h2>
            <p className="text-xs text-gray-500">Sync events and schedule tasks</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-2">
            <Spinner size="sm" />
            <span className="text-sm text-gray-500">Checking connection…</span>
          </div>
        ) : connected ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 bg-green-950 border border-green-800 rounded-lg px-3 py-2">
              <span className="text-green-400 text-sm">✓</span>
              <span className="text-sm text-green-300">Google Calendar connected</span>
            </div>
            <p className="text-xs text-gray-500">
              Your calendar events are synced. Go to the Calendar page and click "Sync" to refresh.
            </p>
            <Button variant="danger" size="sm" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-400">
              Connect your Google Calendar to sync events, schedule tasks, and use AI-powered planning.
            </p>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-500 font-mono">
              <p className="font-semibold text-gray-400 mb-1">Setup required:</p>
              <p>1. Create a Google Cloud project at console.cloud.google.com</p>
              <p>2. Enable Google Calendar API</p>
              <p>3. Create OAuth 2.0 credentials</p>
              <p>4. Add credentials to backend/.env</p>
            </div>
            <Button onClick={() => { void handleConnect() }}>
              Connect Google Calendar
            </Button>
          </div>
        )}
      </section>

      {/* AI features */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-900 flex items-center justify-center text-sm text-purple-300 font-semibold">
            AI
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-100">AI Features</h2>
            <p className="text-xs text-gray-500">Powered by OpenAI (gpt-4o)</p>
          </div>
        </div>
        <p className="text-sm text-gray-400 mb-3">
          AI features include slot suggestions, day planning, accountability responses, and evening reviews.
        </p>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-500 font-mono">
          <p>Set <span className="text-gray-300">OPENAI_API_KEY</span> in backend/.env to enable AI features.</p>
        </div>
      </section>

      {/* Getting started */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-100 mb-3">Getting Started</h2>
        <ol className="flex flex-col gap-2 text-sm text-gray-400 list-decimal list-inside">
          <li>Copy <span className="text-gray-300 font-mono text-xs">backend/.env.example</span> to <span className="text-gray-300 font-mono text-xs">backend/.env</span></li>
          <li>Set <span className="text-gray-300 font-mono text-xs">DATABASE_URL</span>, <span className="text-gray-300 font-mono text-xs">BETTER_AUTH_SECRET</span>, Google OAuth credentials, and OpenAI API key</li>
          <li>Restart the backend server</li>
          <li>Create an account or sign in from the login screen</li>
          <li>Connect Google Calendar above</li>
          <li>Go to the Calendar page and sync your events</li>
          <li>Create tasks and use "Add to Calendar" to schedule them with AI</li>
        </ol>
      </section>
    </div>
  )
}
