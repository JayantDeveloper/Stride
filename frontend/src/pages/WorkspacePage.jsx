import { useEffect, useMemo, useRef, useState } from 'react'
import { TaskRow, TaskListHeader } from '../components/tasks/TaskRow'
import { InlineTaskRow } from '../components/tasks/InlineTaskRow'
import { TaskModal } from '../components/tasks/TaskModal'
import { CheckInModal } from '../components/execute/CheckInModal'
import { ExecutionPomodoro } from '../components/execute/ExecutionPomodoro'
import { MissedBlockRecoveryCard } from '../components/shared/MissedBlockRecoveryCard'
import { Spinner } from '../components/shared/Spinner'
import { Button } from '../components/shared/Button'
import { useTasks } from '../hooks/useTasks'
import { useOrganize } from '../hooks/useAIOrganize'
import { useMissedBlockRecovery } from '../hooks/useMissedBlockRecovery'
import { useTaskActivationAI } from '../hooks/useTaskActivationAI'
import { useCalendarEvents } from '../hooks/useCalendarEvents'
import { useToast } from '../context/ToastContext'
import { PRIORITY_ORDER } from '../constants/todoBoardConstants'
import { todayISO } from '../utils/dateHelpers'

// Focus = dark red, Break = dark teal (matches pomodoro timer colors)
const FOCUS_HIGHLIGHT = { bg: 'rgba(155,44,44,0.22)', borderLeft: '3px solid #fc8181' }
const BREAK_HIGHLIGHT  = { bg: 'rgba(26,107,138,0.22)', borderLeft: '3px solid #67e8f9' }

const PRIORITY_ACCENT = {
  High:   { border: '#F97316', bg: 'rgba(249,115,22,0.10)', label: '#FB923C' },
  Medium: { border: '#4F46E5', bg: 'rgba(79,70,229,0.10)',  label: '#818CF8' },
  Low:    { border: '#4ADE80', bg: 'rgba(22,163,74,0.10)',  label: '#4ADE80' },
  // Legacy fallback
  Urgent: { border: '#EF4444', bg: 'rgba(239,68,68,0.10)', label: '#F87171' },
}

function fmtDuration(mins) {
  if (!mins) return null
  const h = mins / 60
  if (h < 1) return `${Math.round(h * 60)}m`
  const rounded = parseFloat(h.toFixed(1))
  return `${rounded} hour${rounded !== 1 ? 's' : ''}`
}

function cleanStepLabel(step) {
  return String(step ?? '').replace(/^\d+\.\s+/, '').trim()
}

export default function WorkspacePage({ externalSprintRequest, onExternalSprintHandled }) {
  const [filterStatus, setFilterStatus] = useState('active')
  const [sortBy, setSortBy] = useState('priority')
  const [editingNewIds, setEditingNewIds] = useState([])
  const [editingTask, setEditingTask] = useState(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [draggedId, setDraggedId] = useState(null)
  const [checkinState, setCheckinState] = useState(null)

  // Push to Calendar panel
  const [showOrganize, setShowOrganize] = useState(false)
  const [organizeDate, setOrganizeDate] = useState(todayISO())
  const [organizeFromNow, setOrganizeFromNow] = useState(true)

  // Pomodoro mode (reported by ExecutionPomodoro via onModeChange)
  const [pomodoroMode, setPomodoroMode] = useState({ isBreak: false, isRunning: false })
  const [timerStartRequest, setTimerStartRequest] = useState(null)
  const [breakdownSteps, setBreakdownSteps] = useState([])
  const [currentSubtaskIndex, setCurrentSubtaskIndex] = useState(0)
  const [currentSprintGoal, setCurrentSprintGoal] = useState('')

  // Resizable divider
  const [rightPct, setRightPct] = useState(30)
  const containerRef = useRef(null)

  const { tasks, loading, createTask, updateTask, deleteTask, undoDelete, reorderTasks, reload } = useTasks()
  const { reload: reloadEvents } = useCalendarEvents({ skip: true })
  const recovery = useMissedBlockRecovery()
  const { loadingAction: activationLoadingAction, getBreakdown } = useTaskActivationAI()
  const { organize, loading: organizing } = useOrganize({
    onComplete: () => reloadEvents()
  })
  const { addToast } = useToast()

  // Undo delete: Cmd+Z (Mac) / Ctrl+Z (Windows)
  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoDelete()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [undoDelete])

  const activeTask = useMemo(() => {
    const inProgress = tasks.find(t => t.status === 'In Progress')
    if (inProgress) return inProgress
    return tasks
      .filter(t => t.status === 'Not Started')
      .sort((a, b) => {
        const pd = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
        return pd !== 0 ? pd : (a.position ?? 0) - (b.position ?? 0)
      })[0] ?? null
  }, [tasks])

  useEffect(() => {
    setCurrentSprintGoal(activeTask?.current_sprint_goal ?? '')
    setCurrentSubtaskIndex(activeTask?.current_subtask_index ?? 0)
    try {
      setBreakdownSteps(activeTask?.breakdown_json ? JSON.parse(activeTask.breakdown_json) : [])
    } catch {
      setBreakdownSteps([])
    }
  }, [activeTask?.id, activeTask?.current_subtask_index, activeTask?.current_sprint_goal, activeTask?.breakdown_json])

  useEffect(() => {
    if (!externalSprintRequest?.id) return
    setTimerStartRequest(externalSprintRequest)
  }, [externalSprintRequest])

  const filtered = tasks
    .filter(t => !editingNewIds.includes(t.id))
    .filter(t => {
      if (filterStatus === 'active') return t.status !== 'Done'
      if (filterStatus === 'done') return t.status === 'Done'
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
      if (sortBy === 'duration') return (a.estimated_mins ?? 0) - (b.estimated_mins ?? 0)
      return (a.position ?? 0) - (b.position ?? 0)
    })

  const counts = {
    active: tasks.filter(t => t.status !== 'Done').length,
    done: tasks.filter(t => t.status === 'Done').length,
    all: tasks.length,
  }

  async function handleAddTask() {
    const task = await createTask()
    setEditingNewIds(prev => [...prev, task.id])
  }

  async function handleNewTaskSave(taskId, fields) {
    await updateTask(taskId, fields)
    setEditingNewIds(prev => prev.filter(id => id !== taskId))
  }

  function handleNewTaskDone(taskId) {
    setEditingNewIds(prev => prev.filter(id => id !== taskId))
  }

  async function handleModalSave(fields) {
    await updateTask(editingTask.id, fields)
  }

  async function handleDelete(id) {
    await deleteTask(id)
    reloadEvents()
    addToast('Task deleted — Cmd+Z to undo', 'info')
  }

  async function handleFieldSave(id, field, value) {
    await updateTask(id, { [field]: value })
    reloadEvents()
  }

  async function handleOrganize() {
    try {
      const data = await organize({ date: organizeDate, start_from_now: organizeFromNow })
      const n = data.scheduled?.length ?? 0
      addToast(`Scheduled ${n} block${n !== 1 ? 's' : ''} on calendar`, 'success')
    } catch (err) {
      addToast(err.message || 'Push to Calendar failed', 'error')
    }
  }

  async function syncSubtaskState(task, steps, index) {
    const boundedIndex = Math.max(0, Math.min(index, Math.max(steps.length - 1, 0)))
    const goal = steps[boundedIndex] ?? ''
    try {
      await updateTask(task.id, {
        breakdown_json: JSON.stringify(steps),
        current_subtask_index: boundedIndex,
        current_sprint_goal: goal,
        next_step: goal,
      })
      setBreakdownSteps(steps)
      setCurrentSubtaskIndex(boundedIndex)
      setCurrentSprintGoal(goal)
      return goal
    } catch (err) {
      addToast(err.message || 'Could not update sprint goal', 'error')
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
    } catch (err) {
      addToast(err.message || 'Could not break down task', 'error')
      return []
    }
  }

  async function ensureBreakdownForTask(task) {
    if (!task) return []
    try {
      const existing = task.breakdown_json ? JSON.parse(task.breakdown_json) : []
      if (existing.length > 0) return existing
    } catch { /* ignore */ }
    return generateBreakdownForTask(task)
  }

  async function handleBeforeFocusStart({ taskId }) {
    const task = tasks.find(t => t.id === taskId) ?? activeTask
    if (!task) return

    if (task.status === 'Not Started') {
      try {
        await updateTask(task.id, { status: 'In Progress' })
      } catch { /* keep timer flow moving */ }
    }

    // If breakdown already exists, resume at the saved subtask index
    const existing = task.breakdown_json ? JSON.parse(task.breakdown_json) : []
    if (existing.length > 0) {
      const startIndex = Math.max(0, Math.min(task.current_subtask_index ?? 0, existing.length - 1))
      await syncSubtaskState(task, existing, startIndex)
    } else {
      setCurrentSprintGoal('')
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
      void reloadEvents()
      addToast('Task completed', 'success')
    } catch (err) {
      addToast(err.message || 'Could not complete task', 'error')
    }
  }

  async function handleRecoveryStartSprint() {
    try {
      const data = await recovery.startSprintNow()
      const taskId = data?.task?.id ?? recovery.block?.task_id
      if (!taskId) return
      setTimerStartRequest({ id: Date.now() + Math.random(), taskId, plannedMins: 10 })
      void reload()
      void reloadEvents()
      addToast('Starting a 10-minute sprint', 'success')
    } catch (err) {
      addToast(err.message || 'Failed to start sprint', 'error')
      await recovery.reload()
    }
  }

  async function handleRecoveryMove() {
    try {
      await recovery.moveToNextOpenSlot()
      void reloadEvents()
      addToast('Moved to the next open slot', 'success')
    } catch (err) {
      addToast(err.message || 'Failed to move block', 'error')
      await recovery.reload()
    }
  }

  async function handleRecoveryDefer() {
    try {
      await recovery.deferToTomorrow()
      void reloadEvents()
      addToast('Deferred to tomorrow', 'success')
    } catch (err) {
      addToast(err.message || 'Failed to defer block', 'error')
      await recovery.reload()
    }
  }

  async function handleRecoveryDismiss() {
    try {
      await recovery.dismiss()
      addToast('Recovery card dismissed for now', 'info')
    } catch (err) {
      addToast(err.message || 'Failed to dismiss recovery card', 'error')
    }
  }

  // Drag divider to resize panels
  function handleDividerMouseDown(e) {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    const onMove = (e) => {
      const rect = container.getBoundingClientRect()
      const pct = ((rect.right - e.clientX) / rect.width) * 100
      setRightPct(Math.min(55, Math.max(18, pct)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const accent = PRIORITY_ACCENT[activeTask?.priority] ?? PRIORITY_ACCENT.Medium

  // Highlight: red while timer runs (focus), blue on break, persistent red while "In Progress"
  const activeRowHighlight = (() => {
    if (!activeTask) return null
    if (pomodoroMode.isRunning) return pomodoroMode.isBreak ? BREAK_HIGHLIGHT : FOCUS_HIGHLIGHT
    if (activeTask.status === 'In Progress') return FOCUS_HIGHLIGHT
    return null
  })()

  return (
    <div ref={containerRef} className="flex flex-1 min-h-0 h-full overflow-hidden">

      {/* ── Left: Todo list ─────────────────────────────── */}
      <div className="flex flex-col min-h-0 overflow-hidden" style={{ flex: `1 1 0`, minWidth: 0 }}>

        {/* Toolbar */}
        <div
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5"
          style={{ borderBottom: '1px solid var(--color-notion-border)' }}
        >
          <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--color-notion-border)' }}>
            {[
              { key: 'active', label: `Active (${counts.active})` },
              { key: 'done',   label: `Done (${counts.done})` },
              { key: 'all',    label: 'All' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterStatus(f.key)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  filterStatus === f.key ? 'text-notion-text bg-notion-hover' : 'text-notion-muted hover:text-notion-text'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <select
            className="text-xs bg-notion-surface border border-notion-border rounded-md px-2 py-1 text-notion-muted focus:outline-none"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="position">Manual order</option>
            <option value="priority">By priority</option>
            <option value="duration">By duration</option>
          </select>

          <div className="flex-1" />

          <Button variant="secondary" size="sm" onClick={() => setShowOrganize(p => !p)}>
            Push to Calendar
          </Button>

          <Button variant="primary" size="sm" onClick={handleAddTask}>
            + Task
          </Button>
        </div>

        {/* Push to Calendar panel */}
        {showOrganize && (
          <div
            className="flex-shrink-0 flex flex-col gap-2 px-4 py-2.5"
            style={{ borderBottom: '1px solid var(--color-notion-border)', background: 'var(--color-notion-hover)' }}
          >
            {/* From now / Full day toggle */}
            <div className="flex gap-1.5">
              {[
                ['now', 'From now', 'Schedule tasks starting from right now, skipping past time'],
                ['full', 'Full day', 'Schedule tasks from 8am on the chosen date'],
              ].map(([key, label, tip]) => (
                <button
                  key={key}
                  onClick={() => {
                    setOrganizeFromNow(key === 'now')
                    if (key === 'now') setOrganizeDate(todayISO())
                  }}
                  title={tip}
                  className="flex-1 py-1 rounded-md text-xs font-medium transition-colors"
                  style={{
                    border: '1px solid var(--color-notion-border)',
                    background: organizeFromNow === (key === 'now') ? '#6366F1' : 'transparent',
                    color: organizeFromNow === (key === 'now') ? '#fff' : 'var(--color-notion-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-notion-muted">
                {organizeFromNow ? 'Today' : 'Schedule for'}
              </span>
              <input
                type="date"
                className="bg-notion-surface border border-notion-border rounded-lg px-2 py-1 text-xs text-notion-text focus:outline-none focus:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
                value={organizeDate}
                disabled={organizeFromNow}
                onChange={e => setOrganizeDate(e.target.value)}
              />
              <div className="flex-1" />
              <Button variant="primary" size="sm" onClick={handleOrganize} disabled={organizing}>
                {organizing ? <><Spinner size="sm" /> Scheduling...</> : 'Push'}
              </Button>
            </div>
          </div>
        )}

        {recovery.block && (
          <div className="flex-shrink-0 px-4 pt-3">
            <MissedBlockRecoveryCard
              block={recovery.block}
              recommendation={recovery.recommendation}
              aiLoading={recovery.aiLoading}
              actionLoading={recovery.actionLoading}
              onDismiss={() => { void handleRecoveryDismiss() }}
              onStartSprintNow={() => { void handleRecoveryStartSprint() }}
              onMoveToNextOpenSlot={() => { void handleRecoveryMove() }}
              onDeferToTomorrow={() => { void handleRecoveryDefer() }}
            />
          </div>
        )}

        {/* Column headers */}
        <TaskListHeader />

        {/* Inline editors for newly created tasks */}
        {editingNewIds.map(taskId => {
          const task = tasks.find(t => t.id === taskId)
          if (!task) return null
          return (
            <InlineTaskRow
              key={taskId}
              task={task}
              onSave={fields => handleNewTaskSave(taskId, fields)}
              onCancel={() => handleNewTaskDone(taskId)}
            />
          )
        })}

        {/* Task list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : filtered.length === 0 && editingNewIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-notion-muted">
              <p className="text-2xl mb-2 opacity-30">✓</p>
              <p className="text-sm">{filterStatus === 'active' ? 'All caught up.' : 'No tasks here.'}</p>
              {filterStatus === 'active' && (
                <button onClick={handleAddTask} className="mt-3 text-sm text-indigo-400 hover:underline">
                  Add a task
                </button>
              )}
            </div>
          ) : (
            <div>
              {filtered.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isDragging={draggedId === task.id}
                  highlight={task.id === activeTask?.id ? activeRowHighlight : null}
                  onEdit={t => { setEditingTask(t); setTaskModalOpen(true) }}
                  onDelete={handleDelete}
                  onFieldSave={handleFieldSave}
                  onDragStart={() => setDraggedId(task.id)}
                  onDragOver={() => {}}
                  onDrop={() => { if (draggedId && draggedId !== task.id) reorderTasks(draggedId, task.id) }}
                  onDragEnd={() => setDraggedId(null)}
                />
              ))}
            </div>
          )}
        </div>

        {currentSprintGoal && !pomodoroMode.isBreak && (
          <div className="flex-shrink-0 px-4 pb-4">
            <div className="rounded-xl border border-notion-border bg-notion-hover px-4 py-3">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Sprint goal</p>
                {breakdownSteps.length > 0 && (
                  <p className="text-xs text-notion-muted">
                    {Math.min(currentSubtaskIndex + 1, breakdownSteps.length)} of {breakdownSteps.length}
                  </p>
                )}
                <div className="flex-1" />
              </div>
              <p className="mt-1 text-sm text-notion-text leading-relaxed">{currentSprintGoal}</p>
              {breakdownSteps.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => { void handlePreviousSprintGoal() }}
                    disabled={activationLoadingAction !== '' || currentSubtaskIndex <= 0}
                  >
                    Previous
                  </Button>
                  {currentSubtaskIndex < breakdownSteps.length - 1 ? (
                    <Button
                      size="xs"
                      onClick={() => { void handleNextSprintGoal() }}
                      disabled={activationLoadingAction !== ''}
                    >
                      Next sprint goal
                    </Button>
                  ) : (
                    <Button
                      variant="success"
                      size="xs"
                      onClick={() => { void handleCompleteTask() }}
                      disabled={activationLoadingAction !== ''}
                    >
                      Complete task
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Resizable divider ────────────────────────────── */}
      <div
        onMouseDown={handleDividerMouseDown}
        className="flex-shrink-0 flex items-center justify-center group"
        style={{ width: 6, cursor: 'col-resize', background: 'var(--color-notion-border)', flexShrink: 0 }}
      >
        <div className="w-0.5 h-8 rounded-full opacity-0 group-hover:opacity-60 transition-opacity" style={{ background: '#818CF8' }} />
      </div>

      {/* ── Right: Pomodoro + active task ───────────────── */}
      <div
        className="flex-shrink-0 min-h-0 flex flex-col overflow-hidden"
        style={{ width: `${rightPct}%`, background: 'var(--color-notion-surface)' }}
      >
        {/* Timer — centered, fills remaining space */}
        <div className="flex-1 min-h-0 flex items-center justify-center px-4 py-6">
          <div className="w-full">
            <ExecutionPomodoro
              taskId={activeTask?.id ?? null}
              onModeChange={setPomodoroMode}
              onBeforeFocusStart={handleBeforeFocusStart}
              externalStartRequest={timerStartRequest}
              onExternalStartHandled={() => {
                setTimerStartRequest(null)
                onExternalSprintHandled?.()
              }}
              onSessionComplete={({ sessionId, taskId }) => {
                const sessionTask = tasks.find(t => t.id === taskId) ?? activeTask
                if (!sessionTask) return
                setCheckinState({ sessionId, taskId: sessionTask.id, taskTitle: sessionTask.title })
              }}
            />
          </div>
        </div>

        {/* Active task card — bottom */}
        <div className="flex-shrink-0 min-h-0 max-h-[40vh] overflow-y-auto mx-4 mb-4 rounded-xl p-4" style={{
          background: activeTask ? accent.bg : 'var(--color-notion-hover)',
          border: `1px solid ${activeTask ? accent.border + '60' : 'var(--color-notion-border)'}`,
        }}>
          {activeTask ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: accent.label }}>
                Now focusing
              </p>
              <p className="text-sm font-semibold text-notion-text leading-snug truncate">{activeTask.title}</p>
              <p className="text-xs mt-1" style={{ color: accent.label + 'aa' }}>
                {activeTask.priority}
                {fmtDuration(activeTask.estimated_mins) && ` · ${fmtDuration(activeTask.estimated_mins)}`}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => { void handleBreakdown() }}
                  disabled={activationLoadingAction !== ''}
                >
                  {activationLoadingAction === 'breakdown' ? 'Breaking down...' : breakdownSteps.length > 0 ? 'Regenerate subtasks' : 'Break down'}
                </Button>
              </div>

              {breakdownSteps.length > 0 && (
                <div className="mt-3 rounded-lg border border-notion-border bg-notion-hover px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-notion-muted">Breakdown</p>
                  <div className="mt-1 flex flex-col gap-1">
                    {breakdownSteps.map((step, index) => (
                      <p
                        key={`${activeTask.id}-${index}`}
                        className={`text-sm ${
                          index === currentSubtaskIndex ? 'text-notion-text font-medium' : 'text-notion-muted'
                        }`}
                      >
                        {index + 1}. {cleanStepLabel(step)}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-notion-muted text-center">No active tasks</p>
          )}
        </div>
      </div>

      {/* Edit task modal (for description/tags/all fields) */}
      <TaskModal
        key={taskModalOpen ? `task-${editingTask?.id ?? 'new'}` : 'closed'}
        isOpen={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null) }}
        onSave={handleModalSave}
        task={editingTask}
      />

      <CheckInModal
        isOpen={!!checkinState}
        onClose={() => setCheckinState(null)}
        taskId={checkinState?.taskId}
        taskTitle={checkinState?.taskTitle}
        sessionId={checkinState?.sessionId}
        onOutcomeSubmitted={async ({ outcome }) => {
          if (outcome === 'finished' && activeTask) {
            await updateTask(activeTask.id, { status: 'Done' })
          } else if (outcome === 'partial' && activeTask) {
            await updateTask(activeTask.id, { status: 'In Progress' })
          }
          reload()
        }}
      />
    </div>
  )
}
