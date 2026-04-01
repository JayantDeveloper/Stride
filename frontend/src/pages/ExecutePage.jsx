import { useState, useMemo } from 'react'
import { NextUpCard } from '../components/execute/NextUpCard'
import { ExecutionPomodoro } from '../components/execute/ExecutionPomodoro'
import { CheckInModal } from '../components/execute/CheckInModal'
import { AddToCalendarModal } from '../components/tasks/AddToCalendarModal'
import { TaskModal } from '../components/tasks/TaskModal'
import { Spinner } from '../components/shared/Spinner'
import { useTasks } from '../hooks/useTasks'
import { useToast } from '../context/ToastContext'
import { PRIORITY_ORDER } from '../constants/todoBoardConstants'

export default function ExecutePage() {
  const { tasks, loading, updateTask, reload } = useTasks()
  const { addToast } = useToast()
  const [checkinState, setCheckinState] = useState(null) // { sessionId, taskId, taskTitle }
  const [calendarTask, setCalendarTask] = useState(null)
  const [editingTask, setEditingTask] = useState(null)

  // Determine the "next" task
  const nextTask = useMemo(() => {
    if (!tasks.length) return null

    // 1. In Progress tasks first
    const inProgress = tasks.find(t => t.status === 'In Progress')
    if (inProgress) return inProgress

    // 2. Highest priority Not Started task
    const pending = tasks
      .filter(t => t.status === 'Not Started')
      .sort((a, b) => {
        const pDiff = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
        if (pDiff !== 0) return pDiff
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
        if (a.due_date) return -1
        if (b.due_date) return 1
        return (a.position ?? 0) - (b.position ?? 0)
      })

    return pending[0] ?? null
  }, [tasks])

  async function handleMarkDone(task) {
    await updateTask(task.id, { status: 'Done' })
    addToast(`"${task.title}" marked as done`, 'success')
  }

  async function handleSkip(task) {
    // Move to end of list
    await updateTask(task.id, { position: tasks.length + 1 })
    addToast(`Skipped "${task.title}"`, 'info')
    reload()
  }

  function handleSessionComplete({ sessionId, taskId }) {
    if (!nextTask) return
    setCheckinState({
      sessionId,
      taskId: taskId ?? nextTask.id,
      taskTitle: nextTask.title,
    })
  }

  async function handleCheckinOutcome({ outcome }) {
    if (outcome === 'finished' && nextTask) {
      await updateTask(nextTask.id, { status: 'Done' })
    } else if (outcome === 'partial' && nextTask) {
      await updateTask(nextTask.id, { status: 'In Progress' })
    }
    reload()
  }

  async function handleEditSave(fields) {
    if (editingTask) {
      await updateTask(editingTask.id, fields)
      addToast('Task updated', 'success')
      reload()
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Execute</h1>
        <p className="text-sm text-gray-500 mt-0.5">Focus on one thing at a time.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Next task card */}
          <NextUpCard
            task={nextTask}
            onMarkDone={handleMarkDone}
            onSkip={handleSkip}
            onEdit={t => setEditingTask(t)}
          />

          {/* Pomodoro timer */}
          <ExecutionPomodoro
            taskId={nextTask?.id ?? null}
            onSessionComplete={handleSessionComplete}
          />

          {/* Quick actions row */}
          {nextTask && (
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => setCalendarTask(nextTask)}
                className="flex-1 bg-gray-900 border border-gray-800 hover:border-indigo-700 rounded-lg px-4 py-3 text-sm text-gray-400 hover:text-indigo-300 transition-colors text-center"
              >
                ◫ Schedule on Calendar
              </button>
              <button
                onClick={() => updateTask(nextTask.id, { status: 'In Progress' }).then(reload)}
                className="flex-1 bg-gray-900 border border-gray-800 hover:border-blue-700 rounded-lg px-4 py-3 text-sm text-gray-400 hover:text-blue-300 transition-colors text-center"
                disabled={nextTask.status === 'In Progress'}
              >
                ◐ Mark In Progress
              </button>
            </div>
          )}

          {/* Today's remaining tasks mini-list */}
          {tasks.filter(t => t.status !== 'Done' && t.id !== nextTask?.id).length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Up next ({tasks.filter(t => t.status !== 'Done' && t.id !== nextTask?.id).length} more)
              </p>
              <div className="flex flex-col gap-2">
                {tasks
                  .filter(t => t.status !== 'Done' && t.id !== nextTask?.id)
                  .slice(0, 4)
                  .map(task => (
                    <div key={task.id} className="flex items-center gap-2 text-sm text-gray-400">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        task.priority === 'Urgent' ? 'bg-red-500' :
                        task.priority === 'High' ? 'bg-orange-400' : 'bg-gray-600'
                      }`} />
                      <span className="flex-1 truncate">{task.title}</span>
                      <span className="text-xs text-gray-600">{task.estimated_mins}m</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Check-in modal — shown after timer completes */}
      <CheckInModal
        isOpen={!!checkinState}
        onClose={() => setCheckinState(null)}
        taskId={checkinState?.taskId}
        taskTitle={checkinState?.taskTitle}
        sessionId={checkinState?.sessionId}
        onOutcomeSubmitted={handleCheckinOutcome}
      />

      {/* Add to calendar */}
      <AddToCalendarModal
        isOpen={!!calendarTask}
        onClose={() => setCalendarTask(null)}
        task={calendarTask}
      />

      {/* Edit task */}
      <TaskModal
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleEditSave}
        task={editingTask}
      />
    </div>
  )
}
