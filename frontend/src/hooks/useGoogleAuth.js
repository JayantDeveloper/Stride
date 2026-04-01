// useGoogleAuth.js — Google OAuth status and connect/disconnect

import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../utils/apiClient'

export function useGoogleAuth() {
  const [status, setStatus] = useState({ connected: false, email: null })
  const [loading, setLoading] = useState(true)

  const checkStatus = useCallback(async () => {
    try {
      const data = await apiRequest('/api/auth/status')
      setStatus({ connected: data.connected, email: data.email })
    } catch {
      setStatus({ connected: false, email: null })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { checkStatus() }, [checkStatus])

  const connect = useCallback(() => {
    // Full-page redirect to backend OAuth initiation (must hit Railway, not Vercel)
    const base = import.meta.env.VITE_API_URL ?? ''
    window.location.href = `${base}/api/auth/google`
  }, [])

  const disconnect = useCallback(async () => {
    await apiRequest('/api/auth/google', { method: 'DELETE' })
    setStatus({ connected: false, email: null })
  }, [])

  return { ...status, loading, connect, disconnect, refresh: checkStatus }
}
