// useAnalytics.js — fetch analytics data

import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../utils/apiClient'
import { todayISO, addDays } from '../utils/dateHelpers'

export function useAnalytics() {
  const [summary, setSummary] = useState(null)
  const [trends, setTrends] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const end = todayISO()
    const start = addDays(end, -6)
    try {
      const [summaryData, trendsData] = await Promise.all([
        apiRequest(`/api/analytics/summary?start=${start}&end=${end}`),
        apiRequest('/api/analytics/trends'),
      ])
      setSummary(summaryData)
      setTrends(trendsData.trends ?? [])
    } catch {
      // keep previous state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { summary, trends, loading, reload: load }
}
