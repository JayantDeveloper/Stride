import { useCallback, useState } from 'react'
import { apiRequest } from '../utils/apiClient'

export function useTaskActivationAI() {
  const [loadingAction, setLoadingAction] = useState('')

  const run = useCallback(async (action, path, body) => {
    setLoadingAction(action)
    try {
      return await apiRequest(path, { method: 'POST', body })
    } finally {
      setLoadingAction('')
    }
  }, [])

  const getBreakdown = useCallback(async ({ taskId, title, notes = '', context = '' }) => {
    return run('breakdown', '/api/ai/task-breakdown', {
      task_id: taskId,
      title,
      notes,
      context,
    })
  }, [run])

  const getNextStep = useCallback(async ({ taskId, title, notes = '', context = '', recentState = null }) => {
    return run('next-step', '/api/ai/task-next-step', {
      task_id: taskId,
      title,
      notes,
      context,
      recent_state: recentState,
    })
  }, [run])

  const getSprintGoal = useCallback(async ({ taskId, title, notes = '', context = '', recentState = null }) => {
    return run('sprint-goal', '/api/ai/sprint-goal', {
      task_id: taskId,
      title,
      notes,
      context,
      recent_state: recentState,
    })
  }, [run])

  return {
    loadingAction,
    getBreakdown,
    getNextStep,
    getSprintGoal,
  }
}
