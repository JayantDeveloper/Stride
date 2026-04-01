import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../utils/apiClient'

const recoveryRecommendationCache = new Map()
const SESSION_STORAGE_KEY = 'focuslab_recovery_recommendations'

function readSessionCache() {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.sessionStorage.getItem(SESSION_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function getCachedRecommendation(blockId) {
  if (!blockId) return null
  if (recoveryRecommendationCache.has(blockId)) {
    return recoveryRecommendationCache.get(blockId)
  }

  const stored = readSessionCache()[blockId]
  if (stored) {
    recoveryRecommendationCache.set(blockId, stored)
    return stored
  }

  return null
}

function cacheRecommendation(blockId, recommendation) {
  if (!blockId || !recommendation) return
  recoveryRecommendationCache.set(blockId, recommendation)
  if (typeof window === 'undefined') return
  const next = readSessionCache()
  next[blockId] = recommendation
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore storage failures
  }
}

export function useMissedBlockRecovery() {
  const [block, setBlock] = useState(null)
  const [recommendation, setRecommendation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiRequest('/api/calendar/missed-blocks/latest')
      setBlock(data.block ?? null)
      setRecommendation(null)

      if (data.block) {
        const cached = getCachedRecommendation(data.block.id)
        if (cached) {
          setRecommendation(cached)
          setAiLoading(false)
          return
        }

        setAiLoading(true)
        try {
          const framing = await apiRequest('/api/ai/recover-block', {
            method: 'POST',
            body: { block_id: data.block.id, options: data.block.recovery_options },
          })
          cacheRecommendation(data.block.id, framing)
          setRecommendation(framing)
        } catch {
          setRecommendation(null)
        } finally {
          setAiLoading(false)
        }
      } else {
        setAiLoading(false)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const dismiss = useCallback(async () => {
    if (!block) return
    setActionLoading('dismiss')
    try {
      await apiRequest(`/api/calendar/missed-blocks/${block.id}/dismiss`, { method: 'POST' })
      setBlock(null)
      setRecommendation(null)
    } finally {
      setActionLoading('')
    }
  }, [block])

  const startSprintNow = useCallback(async () => {
    if (!block) return null
    setActionLoading('start')
    try {
      const data = await apiRequest(`/api/calendar/missed-blocks/${block.id}/start-sprint`, { method: 'POST' })
      setBlock(null)
      setRecommendation(null)
      return data
    } finally {
      setActionLoading('')
    }
  }, [block])

  const moveToNextOpenSlot = useCallback(async () => {
    if (!block) return null
    setActionLoading('move')
    try {
      const data = await apiRequest(`/api/calendar/missed-blocks/${block.id}/move-next-open-slot`, { method: 'POST' })
      setBlock(null)
      setRecommendation(null)
      return data
    } finally {
      setActionLoading('')
    }
  }, [block])

  const deferToTomorrow = useCallback(async () => {
    if (!block) return null
    setActionLoading('defer')
    try {
      const data = await apiRequest(`/api/calendar/missed-blocks/${block.id}/defer-tomorrow`, { method: 'POST' })
      setBlock(null)
      setRecommendation(null)
      return data
    } finally {
      setActionLoading('')
    }
  }, [block])

  return {
    block,
    recommendation,
    loading,
    aiLoading,
    actionLoading,
    dismiss,
    startSprintNow,
    moveToNextOpenSlot,
    deferToTomorrow,
    reload: load,
  }
}
