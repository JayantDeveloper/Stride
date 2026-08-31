import { useState, useEffect, useCallback } from 'react'
import { apiRequest } from '../utils/apiClient'

export function usePlans() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiRequest('/api/plans')
      setPlans(data.plans ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const getPlan = useCallback((slug) => apiRequest(`/api/plans/${slug}`), [])

  const deletePlan = useCallback(async (slug) => {
    await apiRequest(`/api/plans/${slug}`, { method: 'DELETE' })
    await reload()
  }, [reload])

  return { plans, loading, reload, getPlan, deletePlan }
}
