// useCheckin.js — post-session accountability check-in flow

import { useCallback, useState } from 'react'
import { apiRequest } from '../utils/apiClient'

export function useCheckin() {
  const [loading, setLoading] = useState(false)

  const submitCheckin = useCallback(async ({ sessionId, taskId, outcome, notes = '', aiFollowup = '' }) => {
    setLoading(true)
    try {
      const data = await apiRequest('/api/checkins', {
        method: 'POST',
        body: {
          focus_session_id: sessionId,
          task_id: taskId,
          outcome,
          notes,
          ai_followup: aiFollowup,
        },
      })
      return data.checkin
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, submitCheckin }
}
