// useAIScheduling.js — AI scheduling and planning calls

import { useCallback, useState } from 'react'
import { apiRequest } from '../utils/apiClient'

export function useAIScheduling() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const suggestSlots = useCallback(async ({ taskId, date }) => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiRequest('/api/ai/suggest-slots', {
        method: 'POST',
        body: { task_id: taskId, date },
      })
      return data.suggestions ?? []
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const scheduleDay = useCallback(async ({ date, morningNote = '' }) => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiRequest('/api/ai/schedule-day', {
        method: 'POST',
        body: { date, morning_note: morningNote },
      })
      return data
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const getCheckinResponse = useCallback(async ({ taskId, taskTitle, outcome, notes = '' }) => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiRequest('/api/ai/checkin-response', {
        method: 'POST',
        body: { task_id: taskId, task_title: taskTitle, outcome, notes },
      })
      return data.message ?? ''
    } catch (e) {
      setError(e.message)
      return '' // Non-fatal — proceed without AI response
    } finally {
      setLoading(false)
    }
  }, [])

  const getEveningReview = useCallback(async ({ date }) => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiRequest('/api/ai/evening-review', {
        method: 'POST',
        body: { date },
      })
      return data.review ?? ''
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, error, suggestSlots, scheduleDay, getCheckinResponse, getEveningReview }
}
