import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../utils/apiClient'

const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

export function useGoogleAuth() {
  const [status, setStatus] = useState({ connected: false, account: null })
  const [loading, setLoading] = useState(true)

  const checkStatus = useCallback(async () => {
    try {
      const accounts = await apiRequest('/api/auth/list-accounts')
      const googleAccount = accounts.find(account => account.providerId === 'google') ?? null
      const scopes = Array.isArray(googleAccount?.scopes) ? googleAccount.scopes : []

      setStatus({
        connected: scopes.includes(GOOGLE_CALENDAR_SCOPE),
        account: googleAccount,
      })
    } catch {
      setStatus({ connected: false, account: null })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { checkStatus() }, [checkStatus])

  const connect = useCallback(async ({ callbackURL } = {}) => {
    const data = await apiRequest('/api/auth/link-social', {
      method: 'POST',
      body: {
        provider: 'google',
        disableRedirect: true,
        callbackURL: callbackURL ?? window.location.href,
        scopes: [GOOGLE_CALENDAR_SCOPE],
      },
    })

    if (data?.url) {
      window.location.href = data.url
    }
  }, [])

  const disconnect = useCallback(async () => {
    if (!status.account) return

    await apiRequest('/api/auth/unlink-account', {
      method: 'POST',
      body: {
        providerId: 'google',
        accountId: status.account.accountId,
      },
    })

    setStatus({ connected: false, account: null })
  }, [status.account])

  return { ...status, loading, connect, disconnect, refresh: checkStatus }
}
