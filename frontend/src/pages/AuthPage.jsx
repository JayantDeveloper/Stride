import { useState } from 'react'
import { Button } from '../components/shared/Button'

export default function AuthPage({
  actionLoading = '',
  error = '',
  onSignIn,
  onSignUp,
  onGoogleSignIn,
}) {
  const [mode, setMode] = useState('signin')
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  })

  function update(field, value) {
    setForm(previous => ({ ...previous, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (mode === 'signup') {
      await onSignUp?.({
        name: form.name.trim() || form.email.trim(),
        email: form.email.trim(),
        password: form.password,
      })
      return
    }

    await onSignIn?.({
      email: form.email.trim(),
      password: form.password,
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10" style={{ background: 'var(--color-notion-bg)', color: 'var(--color-notion-text)' }}>
      <div className="w-full max-w-md rounded-2xl border border-notion-border bg-notion-surface p-7 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-300">Stride</p>
        <h1 className="mt-3 text-2xl font-semibold text-notion-text">
          {mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
        </h1>
        <p className="mt-2 text-sm text-notion-muted">
          Use email/password or Google sign-in. Calendar access is connected separately inside Settings.
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => { void handleSubmit(event) }}>
          {mode === 'signup' && (
            <label className="flex flex-col gap-1.5 text-sm text-notion-muted">
              <span>Name</span>
              <input
                value={form.name}
                onChange={event => update('name', event.target.value)}
                className="rounded-lg border border-notion-border bg-notion-bg px-3 py-2 text-sm text-notion-text outline-none"
                placeholder="Jay"
                autoComplete="name"
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm text-notion-muted">
            <span>Email</span>
            <input
              value={form.email}
              onChange={event => update('email', event.target.value)}
              className="rounded-lg border border-notion-border bg-notion-bg px-3 py-2 text-sm text-notion-text outline-none"
              placeholder="you@example.com"
              autoComplete="email"
              type="email"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-notion-muted">
            <span>Password</span>
            <input
              value={form.password}
              onChange={event => update('password', event.target.value)}
              className="rounded-lg border border-notion-border bg-notion-bg px-3 py-2 text-sm text-notion-text outline-none"
              placeholder="••••••••"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              type="password"
              minLength={8}
              required
            />
          </label>

          {error && (
            <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <Button type="submit" disabled={actionLoading !== ''}>
            {actionLoading === 'signin' && 'Signing in...'}
            {actionLoading === 'signup' && 'Creating account...'}
            {actionLoading === '' && (mode === 'signin' ? 'Sign in' : 'Create account')}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-notion-muted">
          <div className="h-px flex-1 bg-notion-border" />
          <span>or</span>
          <div className="h-px flex-1 bg-notion-border" />
        </div>

        <Button variant="secondary" className="w-full" disabled={actionLoading !== ''} onClick={() => { void onGoogleSignIn?.() }}>
          Continue with Google
        </Button>

        <div className="mt-5 text-sm text-notion-muted">
          {mode === 'signin' ? 'Need an account?' : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => setMode(previous => previous === 'signin' ? 'signup' : 'signin')}
            className="text-indigo-300 hover:text-indigo-200"
          >
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
