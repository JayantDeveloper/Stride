import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import alarmSrc from '../assets/freesound_community-alarm-clock-short-6402.mp3'
import { BREAK_SECONDS, COMPLETION_ALARM_PREVIEW_MS, WORK_SECONDS } from '../constants/pomodoroConstants'
import { apiRequest } from '../utils/apiClient'

function secondsUntil(targetEndAt) {
  if (!targetEndAt) return 0
  return Math.max(0, Math.ceil((new Date(targetEndAt).getTime() - Date.now()) / 1000))
}

export function useBoardPomodoroState({ currentTaskId = null, onSessionComplete = null } = {}) {
  const [isRunning, setIsRunning] = useState(false)
  const [isBreak, setIsBreak] = useState(false)
  const [timeLeft, setTimeLeft] = useState(WORK_SECONDS)
  const [completedFocusSessions, setCompletedFocusSessions] = useState(0)
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [targetEndAt, setTargetEndAt] = useState(null)
  const [hydrated, setHydrated] = useState(false)
  const completionAudioRef = useRef(null)
  const stopAlarmTimeoutRef = useRef(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await apiRequest('/api/pomodoro')
        const state = data.state || {}
        const restoredTargetEndAt = state.targetEndAt ?? null
        const restoredRunning = !!state.isRunning && !!restoredTargetEndAt

        setIsBreak(state.isBreak ?? false)
        setCompletedFocusSessions(state.completedFocusSessions ?? 0)
        setCurrentSessionId(state.currentSessionId ?? null)
        setTargetEndAt(restoredRunning ? restoredTargetEndAt : null)
        setIsRunning(restoredRunning)
        setTimeLeft(
          restoredRunning
            ? secondsUntil(restoredTargetEndAt)
            : (state.timeLeft ?? ((state.isBreak ?? false) ? BREAK_SECONDS : WORK_SECONDS))
        )
      } catch {
        setIsRunning(false)
        setIsBreak(false)
        setTimeLeft(WORK_SECONDS)
        setCompletedFocusSessions(0)
        setCurrentSessionId(null)
        setTargetEndAt(null)
      } finally {
        setHydrated(true)
      }
    }

    void load()
  }, [])

  useEffect(() => {
    return () => {
      if (stopAlarmTimeoutRef.current) window.clearTimeout(stopAlarmTimeoutRef.current)
      if (completionAudioRef.current) {
        completionAudioRef.current.pause()
        completionAudioRef.current.currentTime = 0
      }
    }
  }, [])

  const persistState = useCallback(async (state) => {
    try {
      await apiRequest('/api/pomodoro', { method: 'PUT', body: state })
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    void persistState({
      isRunning,
      isBreak,
      timeLeft,
      completedFocusSessions,
      currentSessionId,
      targetEndAt,
    })
  }, [hydrated, isRunning, isBreak, timeLeft, completedFocusSessions, currentSessionId, targetEndAt, persistState])

  const playCompletionRing = useCallback(() => {
    if (!completionAudioRef.current) {
      const audio = new Audio(alarmSrc)
      audio.preload = 'auto'
      completionAudioRef.current = audio
    }

    const alarm = completionAudioRef.current
    if (!alarm) return

    if (stopAlarmTimeoutRef.current) {
      window.clearTimeout(stopAlarmTimeoutRef.current)
      stopAlarmTimeoutRef.current = null
    }

    try {
      alarm.pause()
      alarm.currentTime = 0
    } catch {
      return
    }

    const playPromise = alarm.play()
    if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {})

    stopAlarmTimeoutRef.current = window.setTimeout(() => {
      alarm.pause()
      alarm.currentTime = 0
      stopAlarmTimeoutRef.current = null
    }, COMPLETION_ALARM_PREVIEW_MS)
  }, [])

  const endSession = useCallback(async (sessionId, fields = {}) => {
    if (!sessionId) return
    try {
      await apiRequest(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        body: { ended_at: new Date().toISOString(), ...fields },
      })
    } catch { /* optional */ }
  }, [])

  const completeCurrentInterval = useCallback(() => {
    playCompletionRing()

    const completedSessionId = currentSessionId
    const completedTaskId = currentTaskId
    const nextIsBreak = !isBreak

    if (!isBreak) {
      setCompletedFocusSessions((n) => n + 1)
      void endSession(completedSessionId)
      window.setTimeout(() => {
        onSessionComplete?.({ sessionId: completedSessionId, taskId: completedTaskId })
      }, COMPLETION_ALARM_PREVIEW_MS)
    }

    setCurrentSessionId(null)
    setTargetEndAt(null)
    setIsRunning(false)
    setIsBreak(nextIsBreak)
    setTimeLeft(nextIsBreak ? BREAK_SECONDS : WORK_SECONDS)
  }, [playCompletionRing, currentSessionId, currentTaskId, isBreak, endSession, onSessionComplete])

  useEffect(() => {
    if (!isRunning || !targetEndAt) return

    const syncRemaining = () => {
      const remaining = secondsUntil(targetEndAt)
      if (remaining <= 0) {
        setTimeLeft(0)
        completeCurrentInterval()
        return true
      }

      setTimeLeft(remaining)
      return false
    }

    if (syncRemaining()) return

    const id = window.setInterval(() => {
      syncRemaining()
    }, 1000)

    return () => window.clearInterval(id)
  }, [isRunning, targetEndAt, completeCurrentInterval])

  const startSession = useCallback(async (taskId = null, plannedMins = 25) => {
    try {
      const data = await apiRequest('/api/sessions', {
        method: 'POST',
        body: { task_id: taskId, planned_mins: plannedMins, session_type: 'focus' },
      })
      setCurrentSessionId(data.session.id)
      return data.session
    } catch {
      return null
    }
  }, [])

  const startFocusSessionNow = useCallback(async (taskId = currentTaskId, plannedMins = Math.max(1, Math.round(timeLeft / 60))) => {
    const mins = Math.max(1, plannedMins)
    const session = await startSession(taskId, mins)
    const endAt = new Date(Date.now() + mins * 60_000).toISOString()

    setIsBreak(false)
    setTimeLeft(mins * 60)
    setCurrentSessionId(session?.id ?? null)
    setTargetEndAt(endAt)
    setIsRunning(true)
    return session
  }, [currentTaskId, timeLeft, startSession])

  const pauseTimer = useCallback(() => {
    if (!isRunning) return
    setTimeLeft((prev) => targetEndAt ? secondsUntil(targetEndAt) || prev : prev)
    setTargetEndAt(null)
    setIsRunning(false)
  }, [isRunning, targetEndAt])

  const resumeTimer = useCallback(() => {
    if (isRunning) return
    const endAt = new Date(Date.now() + timeLeft * 1000).toISOString()
    setTargetEndAt(endAt)
    setIsRunning(true)
  }, [isRunning, timeLeft])

  const resetTimer = useCallback(() => {
    if (currentSessionId) {
      void endSession(currentSessionId, { outcome: 'interrupted' })
    }
    setIsRunning(false)
    setTargetEndAt(null)
    setCurrentSessionId(null)
    setTimeLeft(isBreak ? BREAK_SECONDS : WORK_SECONDS)
  }, [currentSessionId, isBreak, endSession])

  const switchMode = useCallback((nextIsBreak) => {
    if (currentSessionId) {
      void endSession(currentSessionId, { outcome: 'interrupted' })
    }
    setIsRunning(false)
    setTargetEndAt(null)
    setIsBreak(nextIsBreak)
    setCurrentSessionId(null)
    setTimeLeft(nextIsBreak ? BREAK_SECONDS : WORK_SECONDS)
  }, [currentSessionId, endSession])

  const toggleRunning = useCallback(async () => {
    if (isRunning) {
      pauseTimer()
      return
    }

    if (!isBreak && !currentSessionId) {
      await startFocusSessionNow(currentTaskId, Math.max(1, Math.round(timeLeft / 60)))
      return
    }

    resumeTimer()
  }, [isRunning, isBreak, currentSessionId, currentTaskId, timeLeft, pauseTimer, resumeTimer, startFocusSessionNow])

  return useMemo(() => ({
    isBreak,
    isRunning,
    completedFocusSessions,
    currentSessionId,
    pauseTimer,
    resumeTimer,
    resetTimer,
    switchMode,
    timeLeft,
    toggleRunning,
    startSession,
    startFocusSessionNow,
  }), [
    isBreak,
    isRunning,
    completedFocusSessions,
    currentSessionId,
    pauseTimer,
    resumeTimer,
    resetTimer,
    switchMode,
    timeLeft,
    toggleRunning,
    startSession,
    startFocusSessionNow,
  ])
}
