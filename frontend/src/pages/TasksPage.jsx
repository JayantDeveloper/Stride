import { useState } from 'react'
import { TaskRow } from '../components/tasks/TaskRow'
import { TaskModal } from '../components/tasks/TaskModal'
import { AddToCalendarModal } from '../components/tasks/AddToCalendarModal'
import { Button } from '../components/shared/Button'
import { Spinner } from '../components/shared/Spinner'
import { useTasks } from '../hooks/useTasks'
import { useToast } from '../context/ToastContext'
import { PRIORITY_OPTIONS, TODO_STATUS_OPTIONS } from '../constants/todoBoardConstants'
import { PRIORITY_ORDER } from '../constants/todoBoardConstants'

export default function TasksPage() {
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [sortBy, setSortBy] = useState('priority')
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [calendarTask, setCalendarTask] = useState(null)
  const [draggedId, setDraggedId] = useState(null)

  const { tasks, loading, createTask, updateTask, deleteTask, reorderTasks } = useTasks()
  const { addToast } = useToast()

  const filtered = tasks
    .filter(t => filterStatus === 'all' || t.status === filterStatus)
    .filter(t => filterPriority === 'all' || t.priority === filterPriority)
    .sort((a, b) => {
      if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
      if (sortBy === 'due_date') {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date.localeCompare(b.due_date)
      }
      return (a.position ?? 0) - (b.position ?? 0)
    })

  async function handleSave(fields) {
    if (editingTask) {
      await updateTask(editingTask.id, fields)
      addToast('Task updated', 'success')
    } else {
      await createTask(fields)
      addToast('Task created', 'success')
    }
  }

  async function handleDelete(id) {
    await deleteTask(id)
    addToast('Task deleted', 'info')
  }

  async function handleStatusChange(id, status) {
    await updateTask(id, { status })
  }

  const counts = {
    all: tasks.length,
    'Not Started': tasks.filter(t => t.status === 'Not Started').length,
    'In Progress': tasks.filter(t => t.status === 'In Progress').length,
    'Done': tasks.filter(t => t.status === 'Done').length,
  }

  const STATUS_FILTERS = [
    { key: 'all', label: `All` },
    { key: 'Not Started', label: 'Not Started' },
    { key: 'In Progress', label: 'In Progress' },
    { key: 'Done', label: 'Done' },
  ]

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-notion-text">Tasks</h1>
          <p className="text-sm text-notion-muted mt-0.5">
            {tasks.length} total · {counts['In Progress']} in progress
          </p>
        </div>
        <Button onClick={() => { setEditingTask(null); setTaskModalOpen(true) }}>
          + New task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {/* Status pills */}
        <div className="flex gap-px rounded-lg overflow-hidden border border-notion-border">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filterStatus === key
                  ? 'bg-notion-hover text-notion-text'
                  : 'text-notion-muted hover:text-notion-text hover:bg-notion-hover'
              }`}
            >
              {label}
              <span className="ml-1.5 text-notion-muted font-normal">
                {key === 'all' ? counts.all : (counts[key] ?? 0)}
              </span>
            </button>
          ))}
        </div>

        {/* Priority filter */}
        <select
          className="bg-notion-surface border border-notion-border rounded-lg px-3 py-1.5 text-xs text-notion-muted focus:outline-none focus:border-notion-text/30 transition-colors"
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
        >
          <option value="all">All priorities</option>
          {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
        </select>

        {/* Sort */}
        <select
          className="bg-notion-surface border border-notion-border rounded-lg px-3 py-1.5 text-xs text-notion-muted focus:outline-none focus:border-notion-text/30 transition-colors ml-auto"
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
        >
          <option value="position">Manual order</option>
          <option value="priority">By priority</option>
          <option value="due_date">By due date</option>
        </select>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-notion-muted">
          <p className="text-3xl mb-3 opacity-40">✓</p>
          <p className="text-sm">
            {filterStatus !== 'all' ? 'No tasks match this filter.' : 'No tasks yet. Create one to get started.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {filtered.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              isDragging={draggedId === task.id}
              onEdit={t => { setEditingTask(t); setTaskModalOpen(true) }}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
              onAddToCalendar={t => setCalendarTask(t)}
              onDragStart={() => setDraggedId(task.id)}
              onDragOver={() => {}}
              onDrop={() => { if (draggedId && draggedId !== task.id) reorderTasks(draggedId, task.id) }}
              onDragEnd={() => setDraggedId(null)}
            />
          ))}
        </div>
      )}

      <TaskModal
        isOpen={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null) }}
        onSave={handleSave}
        task={editingTask}
      />

      <AddToCalendarModal
        isOpen={!!calendarTask}
        onClose={() => setCalendarTask(null)}
        task={calendarTask}
      />
    </div>
  )
}
