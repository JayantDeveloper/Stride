import { useEffect, useMemo, useState } from 'react'

import { getFilteredTasks, getWorkspaceTaskCounts } from './workspaceModels.js'

export function useWorkspaceTaskBoard({
  tasks,
  loading,
  createTask,
  updateTask,
  deleteTask,
  undoDelete,
  reorderTasks,
  reloadEvents,
  addToast,
}) {
  const [filterStatus, setFilterStatus] = useState('active')
  const [sortBy, setSortBy] = useState('priority')
  const [editingTask, setEditingTask] = useState(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [draggedId, setDraggedId] = useState(null)

  useEffect(() => {
    const handler = event => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undoDelete()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [undoDelete])

  const counts = useMemo(() => getWorkspaceTaskCounts(tasks), [tasks])

  const filteredTasks = useMemo(() => getFilteredTasks(tasks, {
    filterStatus,
    sortBy,
  }), [tasks, filterStatus, sortBy])

  async function handleAddTask() {
    setFilterStatus('active')
    setSortBy('position')
    await createTask({ allow_split: 1 })
  }

  function openTaskModal(task) {
    setEditingTask(task)
    setTaskModalOpen(true)
  }

  function closeTaskModal() {
    setTaskModalOpen(false)
    setEditingTask(null)
  }

  async function handleNewTaskSave(taskId, fields) {
    await updateTask(taskId, fields)
  }

  function handleNewTaskDone() {}

  async function handleModalSave(fields) {
    if (!editingTask) return
    await updateTask(editingTask.id, fields)
  }

  async function handleDeleteTask(id) {
    await deleteTask(id)
    await reloadEvents?.()
    addToast('Task deleted — Cmd+Z to undo', 'info')
  }

  async function handleFieldSave(id, field, value) {
    await updateTask(id, { [field]: value })
    await reloadEvents?.()
  }

  function handleTaskDragStart(taskId) {
    setDraggedId(taskId)
  }

  async function handleTaskDrop(taskId) {
    if (!draggedId || draggedId === taskId) return
    await reorderTasks(draggedId, taskId)
  }

  function handleTaskDragEnd() {
    setDraggedId(null)
  }

  return {
    loading,
    filterStatus,
    sortBy,
    counts,
    draggedId,
    filteredTasks,
    editingTaskIds: [],
    taskModalOpen,
    editingTask,
    setFilterStatus,
    setSortBy,
    handleAddTask,
    openTaskModal,
    closeTaskModal,
    handleModalSave,
    handleDeleteTask,
    handleFieldSave,
    handleNewTaskSave,
    handleNewTaskDone,
    handleTaskDragStart,
    handleTaskDrop,
    handleTaskDragEnd,
  }
}
