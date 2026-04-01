// useFocusSession.js — active focus session CRUD

import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../utils/apiClient'

export function useFocusSession() {
  const [activeSession, setActiveSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiRequest('/api/sessions/active')
      .then(data => setActiveSession(data.session))
      .catch(() => setActiveSession(null))
      .finally(() => setLoading(false))
  }, [])

  const startSession = useCallback(async ({ taskId = null, plannedMins = 25 }) => {
    const data = await apiRequest('/api/sessions', {
      method: 'POST',
      body: { task_id: taskId, planned_mins: plannedMins, session_type: 'focus' },
    })
    setActiveSession(data.session)
    return data.session
  }, [])

  const endSession = useCallback(async ({ sessionId, outcome = 'completed', notes = '' }) => {
    const now = new Date().toISOString()
    const data = await apiRequest(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      body: { ended_at: now, outcome, notes },
    })
    setActiveSession(null)
    return data.session
  }, [])

  return { activeSession, loading, startSession, endSession }
}
