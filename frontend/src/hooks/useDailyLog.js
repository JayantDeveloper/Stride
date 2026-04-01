// useDailyLog.js — morning plans and evening review state

import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../utils/apiClient'
import { todayISO } from '../utils/dateHelpers'

export function useDailyLog(date = todayISO()) {
  const [log, setLog] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    apiRequest(`/api/daily-log/${date}`)
      .then(data => setLog(data.log))
      .catch(() => setLog(null))
      .finally(() => setLoading(false))
  }, [date])

  const updateNote = useCallback(async (field, value) => {
    setSaving(true)
    try {
      const data = await apiRequest(`/api/daily-log/${date}`, {
        method: 'PATCH',
        body: { [field]: value },
      })
      setLog(data.log)
    } finally {
      setSaving(false)
    }
  }, [date])

  const generateAIPlan = useCallback(async (morningNote = '') => {
    setSaving(true)
    try {
      const data = await apiRequest(`/api/daily-log/${date}/ai-plan`, { method: 'POST' })
      setLog(data.log)
      return data.plan
    } finally {
      setSaving(false)
    }
  }, [date])

  const generateEveningReview = useCallback(async () => {
    setSaving(true)
    try {
      const data = await apiRequest(`/api/daily-log/${date}/ai-review`, { method: 'POST' })
      setLog(data.log)
      return data.review
    } finally {
      setSaving(false)
    }
  }, [date])

  const parsedPlan = log?.ai_plan ? (() => { try { return JSON.parse(log.ai_plan) } catch { return null } })() : null

  return { log, loading, saving, updateNote, generateAIPlan, generateEveningReview, parsedPlan }
}
