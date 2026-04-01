// useCalendarEvents.js — fetch and cache calendar events

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../utils/apiClient'

export function useCalendarEvents({ start, end, skip = false } = {}) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const lastDeletedEventRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (start) params.set('start', start)
      if (end) params.set('end', end)
      const q = params.toString()
      const data = await apiRequest(`/api/calendar/events${q ? '?' + q : ''}`)
      setEvents(data.events || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [start, end])

  useEffect(() => { if (!skip) load() }, [load, skip])

  const syncFromGoogle = useCallback(async () => {
    setSyncing(true)
    try {
      const data = await apiRequest('/api/calendar/sync', { method: 'POST' })
      await load() // Reload from local cache after sync
      return data.synced
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setSyncing(false)
    }
  }, [load])

  const createEvent = useCallback(async ({ title, description, location, start_time, end_time, all_day, color, color_id, task_id }) => {
    const data = await apiRequest('/api/calendar/events', {
      method: 'POST',
      body: { title, description, location, start_time, end_time, all_day, color, color_id, task_id },
    })
    setEvents(prev => [...prev, data.event])
    return data.event
  }, [])

  const updateEvent = useCallback(async (id, fields) => {
    const data = await apiRequest(`/api/calendar/events/${id}`, {
      method: 'PATCH',
      body: fields,
    })
    setEvents(prev => prev.map(e => e.id === id ? data.event : e))
    return data.event
  }, [])

  const deleteEvent = useCallback(async (id) => {
    const deleted = events.find(e => e.id === id)
    lastDeletedEventRef.current = deleted ?? null
    setEvents(prev => prev.filter(e => e.id !== id))
    try {
      await apiRequest(`/api/calendar/events/${id}`, { method: 'DELETE' })
    } catch {
      await load()
    }
  }, [load, events])

  const undoDeleteEvent = useCallback(async () => {
    const ev = lastDeletedEventRef.current
    if (!ev) return
    lastDeletedEventRef.current = null
    try {
      const data = await apiRequest('/api/calendar/events', {
        method: 'POST',
        body: {
          title: ev.title,
          description: ev.description,
          start_time: ev.start_time,
          end_time: ev.end_time,
          color: ev.color,
          color_id: ev.color_id,
        },
      })
      setEvents(prev => [...prev, data.event])
    } catch {
      // Restore to local UI state (not persisted) as best-effort fallback
      setEvents(prev => [...prev, ev])
    }
  }, [])

  return { events, loading, syncing, error, syncFromGoogle, createEvent, updateEvent, deleteEvent, undoDeleteEvent, reload: load }
}
