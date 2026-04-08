import { useMemo, useState } from 'react'

import { getActiveTask, getSprintState } from './workspaceModels.js'

const FOCUS_HIGHLIGHT = { bg: 'rgba(155,44,44,0.22)', borderLeft: '3px solid #fc8181' }
const BREAK_HIGHLIGHT = { bg: 'rgba(26,107,138,0.22)', borderLeft: '3px solid #67e8f9' }

function clampSprintIndex(steps, index) {
  return Math.max(0, Math.min(index, Math.max(steps.length - 1, 0)))
}

export function useWorkspaceSprintController({
  tasks,
  updateTask,
  reloadTasks,
  getBreakdown,
  addToast,
  externalSprintRequest,
  onExternalSprintHandled,
}) {
  const [pomodoroMode, setPomodoroMode] = useState({ isBreak: false, isRunning: false })
  const [internalTimerStartRequest, setInternalTimerStartRequest] = useState(null)
  const [checkinState, setCheckinState] = useState(null)

  const activeTask = useMemo(() => getActiveTask(tasks), [tasks])

  const sprintState = useMemo(() => getSprintState(activeTask), [activeTask])
  const { breakdownSteps, currentSubtaskIndex, currentSprintGoal } = sprintState

  const timerStartRequest = externalSprintRequest?.id ? externalSprintRequest : internalTimerStartRequest

  const activeRowHighlight = useMemo(() => {
    if (!activeTask) return null
    if (pomodoroMode.isRunning) return pomodoroMode.isBreak ? BREAK_HIGHLIGHT : FOCUS_HIGHLIGHT
    if (activeTask.status === 'In Progress') return FOCUS_HIGHLIGHT
    return null
  }, [activeTask, pomodoroMode])

  async function syncSubtaskState(task, steps, index) {
    const boundedIndex = clampSprintIndex(steps, index)
    const goal = steps[boundedIndex] ?? ''

    try {
      await updateTask(task.id, {
        breakdown_json: JSON.stringify(steps),
        current_subtask_index: boundedIndex,
        current_sprint_goal: goal,
        next_step: goal,
      })
      return goal
    } catch (error) {
      addToast(error.message || 'Could not update sprint goal', 'error')
      return ''
    }
  }

  async function generateBreakdownForTask(task) {
    if (!task) return []

    try {
      const data = await getBreakdown({
        taskId: task.id,
        title: task.title,
        notes: task.description ?? '',
      })
      const steps = data.steps ?? []

      if (steps.length === 0) return []

      await syncSubtaskState(task, steps, 0)
      return steps
    } catch (error) {
      addToast(error.message || 'Could not break down task', 'error')
      return []
    }
  }

  async function ensureBreakdownForTask(task) {
    if (!task) return []

    const existing = getSprintState(task).breakdownSteps
    if (existing.length > 0) return existing

    return generateBreakdownForTask(task)
  }

  async function handleBeforeFocusStart({ taskId }) {
    const task = tasks.find(candidate => candidate.id === taskId) ?? activeTask
    if (!task) return

    if (task.status === 'Not Started') {
      try {
        await updateTask(task.id, { status: 'In Progress' })
      } catch {
        // Keep timer start flow moving even if the status update fails.
      }
    }

    const existingState = getSprintState(task)
    if (existingState.breakdownSteps.length > 0) {
      await syncSubtaskState(task, existingState.breakdownSteps, existingState.currentSubtaskIndex)
    }
  }

  async function handleBreakdown() {
    if (!activeTask) return
    const steps = await generateBreakdownForTask(activeTask)
    if (steps.length > 0) addToast('Subtasks ready', 'success')
  }

  async function handlePreviousSprintGoal() {
    if (!activeTask) return
    if (breakdownSteps.length === 0 || currentSubtaskIndex <= 0) return

    await syncSubtaskState(activeTask, breakdownSteps, currentSubtaskIndex - 1)
  }

  async function handleNextSprintGoal() {
    if (!activeTask) return

    const steps = breakdownSteps.length > 0 ? breakdownSteps : await ensureBreakdownForTask(activeTask)
    if (steps.length === 0) return

    const nextIndex = Math.min(currentSubtaskIndex + 1, steps.length - 1)
    if (nextIndex === currentSubtaskIndex) return

    await syncSubtaskState(activeTask, steps, nextIndex)
    addToast('Next sprint goal ready', 'success')
  }

  async function handleCompleteTask() {
    if (!activeTask) return

    try {
      await updateTask(activeTask.id, {
        status: 'Done',
        current_sprint_goal: '',
        next_step: '',
      })
      addToast('Task completed', 'success')
    } catch (error) {
      addToast(error.message || 'Could not complete task', 'error')
    }
  }

  function requestTimerStart({ taskId, plannedMins }) {
    setInternalTimerStartRequest({
      id: Date.now() + Math.random(),
      taskId,
      plannedMins,
    })
  }

  function handleTimerStartHandled(requestId) {
    if (externalSprintRequest?.id === requestId) {
      onExternalSprintHandled?.()
      return
    }

    if (internalTimerStartRequest?.id === requestId) {
      setInternalTimerStartRequest(null)
    }
  }

  function handleSessionComplete({ sessionId, taskId }) {
    const sessionTask = tasks.find(task => task.id === taskId) ?? activeTask
    if (!sessionTask) return

    setCheckinState({
      sessionId,
      taskId: sessionTask.id,
      taskTitle: sessionTask.title,
    })
  }

  function closeCheckin() {
    setCheckinState(null)
  }

  async function handleCheckinOutcomeSubmitted({ outcome }) {
    const targetTaskId = checkinState?.taskId
    if (!targetTaskId) {
      await reloadTasks()
      return
    }

    if (outcome === 'finished') {
      await updateTask(targetTaskId, { status: 'Done' })
    } else if (outcome === 'partial') {
      await updateTask(targetTaskId, { status: 'In Progress' })
    }

    await reloadTasks()
  }

  return {
    activeTask,
    pomodoroMode,
    timerStartRequest,
    checkinState,
    breakdownSteps,
    currentSubtaskIndex,
    currentSprintGoal,
    activeRowHighlight,
    setPomodoroMode,
    requestTimerStart,
    handleTimerStartHandled,
    handleBeforeFocusStart,
    handleBreakdown,
    handlePreviousSprintGoal,
    handleNextSprintGoal,
    handleCompleteTask,
    handleSessionComplete,
    closeCheckin,
    handleCheckinOutcomeSubmitted,
  }
}
