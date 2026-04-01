// useAIOrganize.js — deterministic task-to-calendar scheduling (no AI)

import { useCallback, useState } from 'react'
import { apiRequest } from '../utils/apiClient'

export function useOrganize({ onComplete } = {}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const organize = useCallback(async ({ date, start_from_now = false }) => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiRequest('/api/calendar/organize', {
        method: 'POST',
        body: { date, start_from_now },
      })
      onComplete?.(data)
      return data
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [onComplete])

  return { organize, loading, error }
}
