import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../utils/apiClient'

function authCallbackUrl() {
  return `${window.location.origin}${window.location.pathname}${window.location.search}`
}

export function useAuthSession() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async ({ silent = false } = {}) => {
    setLoading(true)
    try {
      const data = await apiRequest('/api/auth/get-session')
      setSession(data)
      setError('')
      return data
    } catch (err) {
      setSession(null)
      // Don't surface network errors from the passive session check — not logged in is the expected state
      if (!silent) setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh({ silent: true })
  }, [refresh])

  const signUpWithEmail = useCallback(async ({ name, email, password }) => {
    setActionLoading('signup')
    setError('')
    try {
      await apiRequest('/api/auth/sign-up/email', {
        method: 'POST',
        body: {
          name,
          email,
          password,
          rememberMe: true,
          callbackURL: authCallbackUrl(),
        },
      })
      return await refresh()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setActionLoading('')
    }
  }, [refresh])

  const signInWithEmail = useCallback(async ({ email, password }) => {
    setActionLoading('signin')
    setError('')
    try {
      await apiRequest('/api/auth/sign-in/email', {
        method: 'POST',
        body: {
          email,
          password,
          rememberMe: true,
          callbackURL: authCallbackUrl(),
        },
      })
      return await refresh()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setActionLoading('')
    }
  }, [refresh])

  const signInWithGoogle = useCallback(async () => {
    setActionLoading('google')
    setError('')
    try {
      const data = await apiRequest('/api/auth/sign-in/social', {
        method: 'POST',
        body: {
          provider: 'google',
          disableRedirect: true,
          callbackURL: authCallbackUrl(),
        },
      })

      if (data?.url) {
        window.location.href = data.url
      }
    } catch (err) {
      setError(err.message)
      setActionLoading('')
      throw err
    }
  }, [])

  const signOut = useCallback(async () => {
    setActionLoading('signout')
    setError('')
    try {
      await apiRequest('/api/auth/sign-out', {
        method: 'POST',
      })
      setSession(null)
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setActionLoading('')
    }
  }, [])

  return {
    session,
    user: session?.user ?? null,
    loading,
    actionLoading,
    error,
    refresh,
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle,
    signOut,
  }
}
