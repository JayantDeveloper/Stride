// State for the Focus tab: which task is proposed, and which one is locked for today.
//
// The lock lives server-side (via /api/settings) rather than in localStorage, because the
// app is used on both a laptop and a phone — a lock that does not survive switching
// devices is not a lock.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../utils/apiClient'
import { rankTasks } from '../utils/focusScore'

const todayKey = () => {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return `focus.lock.${local.toISOString().slice(0, 10)}`
}

export function useFocusTask(tasks) {
  const [lockedId, setLockedId] = useState(null)
  const [loadingLock, setLoadingLock] = useState(true)
  const [skipped, setSkipped] = useState([])

  const key = todayKey()

  useEffect(() => {
    let cancelled = false
    apiRequest(`/api/settings/${key}`)
      .then((d) => { if (!cancelled) setLockedId(d.value || null) })
      .catch(() => { if (!cancelled) setLockedId(null) })
      .finally(() => { if (!cancelled) setLoadingLock(false) })
    return () => { cancelled = true }
  }, [key])

  const ranked = useMemo(() => rankTasks(tasks), [tasks])

  // The locked task wins outright. Otherwise the best-scoring candidate that has not been
  // skipped today — skips are in-memory on purpose, so reopening the app gives you a
  // clean proposal rather than remembering a mood from three hours ago.
  const locked = lockedId ? ranked.find((e) => e.task.id === lockedId) : null
  const proposal = locked || ranked.find((e) => !skipped.includes(e.task.id)) || null
  const exhausted = !locked && !proposal && ranked.length > 0

  const lock = useCallback(async (id) => {
    setLockedId(id)
    try {
      await apiRequest(`/api/settings/${key}`, { method: 'PUT', body: { value: String(id) } })
    } catch { /* optimistic; the tab still works if the write fails */ }
  }, [key])

  const unlock = useCallback(async () => {
    setLockedId(null)
    try { await apiRequest(`/api/settings/${key}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }, [key])

  const skip = useCallback((id) => setSkipped((s) => [...s, id]), [])
  const resetSkips = useCallback(() => setSkipped([]), [])

  return { proposal, locked: Boolean(locked), loadingLock, lock, unlock, skip, resetSkips, exhausted, ranked }
}
