// useTasks.js — extended task hook with new schema (replaces useBoardTodoItems for most pages)

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../utils/apiClient'

export function useTasks(filters = {}) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const lastDeletedRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.priority) params.set('priority', filters.priority)
      const q = params.toString()
      const data = await apiRequest(`/api/tasks${q ? '?' + q : ''}`)
      setTasks(data.tasks || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filters.status, filters.priority])

  useEffect(() => { load() }, [load])

  const createTask = useCallback(async (fields = {}) => {
    const data = await apiRequest('/api/tasks', {
      method: 'POST',
      body: {
        title: fields.title ?? 'New task',
        description: fields.description ?? '',
        status: fields.status ?? 'Not Started',
        priority: fields.priority ?? 'Medium',
        difficulty: fields.difficulty ?? 'Easy',
        estimated_mins: fields.estimated_mins ?? 30,
        due_date: fields.due_date ?? null,
        scheduled_date: fields.scheduled_date ?? null,
        tags: fields.tags ?? [],
        allow_split: fields.allow_split ?? 1,
      },
    })
    setTasks(prev => [...prev, data.task])
    return data.task
  }, [])

  const updateTask = useCallback(async (id, fields) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t))
    try {
      const data = await apiRequest(`/api/tasks/${id}`, { method: 'PATCH', body: fields })
      setTasks(prev => prev.map(t => t.id === id ? data.task : t))
      return data.task
    } catch (e) {
      // Revert optimistic update
      await load()
      throw e
    }
  }, [load])

  const deleteTask = useCallback(async (id) => {
    const deleted = tasks.find(t => t.id === id)
    lastDeletedRef.current = deleted ?? null
    setTasks(prev => prev.filter(t => t.id !== id))
    try {
      await apiRequest(`/api/tasks/${id}`, { method: 'DELETE' })
    } catch {
      await load()
    }
  }, [load, tasks])

  const undoDelete = useCallback(async () => {
    const task = lastDeletedRef.current
    if (!task) return
    lastDeletedRef.current = null
    await createTask({
      title: task.title,
      status: task.status,
      priority: task.priority,
      difficulty: task.difficulty,
      estimated_mins: task.estimated_mins,
      due_date: task.due_date,
      scheduled_date: task.scheduled_date,
      description: task.description,
      tags: task.tags,
      allow_split: task.allow_split,
    })
  }, [createTask])

  // Reorder via drag-and-drop — update position in state, persist async
  const reorderTasks = useCallback(async (fromId, toId) => {
    let newPosition = 0
    setTasks(prev => {
      const arr = [...prev]
      const from = arr.findIndex(t => t.id === fromId)
      const to = arr.findIndex(t => t.id === toId)
      if (from === -1 || to === -1) return prev
      newPosition = to + 1
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      return arr
    })
    try {
      await apiRequest(`/api/tasks/${fromId}`, {
        method: 'PATCH',
        body: { position: newPosition },
      })
    } catch { /* keep reorder */ }
  }, [])

  return { tasks, loading, error, createTask, updateTask, deleteTask, undoDelete, reorderTasks, reload: load }
}
