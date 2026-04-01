import { useCallback, useEffect, useRef, useState } from 'react'
import { useBoardPomodoroState } from '../../hooks/useBoardPomodoroState'
import { formatSeconds } from '../../utils/dateHelpers'
import { WORK_SECONDS, BREAK_SECONDS } from '../../constants/pomodoroConstants'

// Colors from FocusDesk
const FOCUS_BG = 'linear-gradient(160deg, #9b2c2c 0%, #7b1d1d 56%, #3d0a0a 100%)'
const BREAK_BG = 'linear-gradient(160deg, #1a6b8a 0%, #0e7490 56%, #065471 100%)'
const FOCUS_RING = '#fc8181'   // red-300 — visible on dark red bg
const BREAK_RING = '#67e8f9'   // cyan-300 — visible on dark teal bg

export function ExecutionPomodoro({
  taskId,
  onSessionComplete,
  onModeChange,
  onBeforeFocusStart,
  externalStartRequest,
  onExternalStartHandled,
}) {
  const {
    isBreak, isRunning, timeLeft, completedFocusSessions,
    currentSessionId, pauseTimer, resumeTimer, resetTimer, switchMode, startFocusSessionNow,
  } = useBoardPomodoroState({ currentTaskId: taskId, onSessionComplete })
  const [starting, setStarting] = useState(false)
  const handledExternalStartRef = useRef(null)

  useEffect(() => {
    onModeChange?.({ isBreak, isRunning })
  }, [isBreak, isRunning, onModeChange])

  const handleStartFocus = useCallback(async (plannedMins, explicitTaskId = taskId) => {
    setStarting(true)
    try {
      await onBeforeFocusStart?.({ taskId: explicitTaskId, plannedMins })
      await startFocusSessionNow(explicitTaskId, plannedMins)
    } finally {
      setStarting(false)
    }
  }, [onBeforeFocusStart, startFocusSessionNow, taskId])

  useEffect(() => {
    if (!externalStartRequest?.id || handledExternalStartRef.current === externalStartRequest.id) return
    handledExternalStartRef.current = externalStartRequest.id

    void handleStartFocus(
      externalStartRequest.plannedMins ?? Math.round(timeLeft / 60),
      externalStartRequest.taskId ?? taskId
    ).finally(() => {
      onExternalStartHandled?.(externalStartRequest.id)
    })
  }, [externalStartRequest, handleStartFocus, onExternalStartHandled, taskId, timeLeft])

  async function handlePrimaryAction() {
    if (isRunning) {
      pauseTimer()
      return
    }

    if (!isBreak && !currentSessionId) {
      await handleStartFocus(Math.max(1, Math.round(timeLeft / 60)), taskId)
      return
    }

    resumeTimer()
  }

  const totalSeconds = isBreak ? BREAK_SECONDS : WORK_SECONDS
  const progress = 1 - timeLeft / totalSeconds
  const circumference = 2 * Math.PI * 54

  return (
    <div
      className="rounded-2xl p-6 flex flex-col items-center gap-5"
      style={{ background: isBreak ? BREAK_BG : FOCUS_BG }}
    >
      {/* Mode tabs */}
      <div className="flex rounded-full p-1 gap-1" style={{ background: 'rgba(0,0,0,0.25)' }}>
        <button
          onClick={() => switchMode(false)}
          className="px-4 py-1.5 rounded-full text-xs font-semibold transition-colors"
          style={{
            background: !isBreak ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: !isBreak ? '#fff' : 'rgba(255,255,255,0.6)',
          }}
        >
          Focus
        </button>
        <button
          onClick={() => switchMode(true)}
          className="px-4 py-1.5 rounded-full text-xs font-semibold transition-colors"
          style={{
            background: isBreak ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: isBreak ? '#fff' : 'rgba(255,255,255,0.6)',
          }}
        >
          Break
        </button>
      </div>

      {/* SVG ring timer */}
      <div className="relative flex items-center justify-center">
        <svg width="128" height="128" className="-rotate-90">
          <circle cx="64" cy="64" r="54" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
          <circle
            cx="64" cy="64" r="54"
            fill="none"
            stroke={isBreak ? BREAK_RING : FOCUS_RING}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute text-center">
          <div
            className="tabular-nums leading-none"
            style={{
              fontSize: '32px',
              fontWeight: 800,
              color: '#fff',
              textShadow: '0 4px 16px rgba(0,0,0,0.3)',
            }}
          >
            {formatSeconds(timeLeft)}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <button
          onClick={() => { void handlePrimaryAction() }}
          disabled={starting}
          className="px-6 py-2.5 rounded-full text-white font-semibold text-sm transition-colors"
          style={{ background: 'rgba(255,255,255,0.17)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.27)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.17)'}
        >
          {starting ? '...' : isRunning ? '⏸ Pause' : '▶ Start'}
        </button>
        <button
          onClick={resetTimer}
          className="px-4 py-2.5 rounded-full text-sm transition-colors"
          style={{ background: 'rgba(255,255,255,0.17)', color: '#fff' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.27)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.17)'}
        >
          ↺
        </button>
      </div>

      {/* Session count */}
      {completedFocusSessions > 0 && (
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {completedFocusSessions} session{completedFocusSessions !== 1 ? 's' : ''} completed today
        </p>
      )}
    </div>
  )
}
