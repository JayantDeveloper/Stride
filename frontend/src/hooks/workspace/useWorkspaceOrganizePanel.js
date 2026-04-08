import { useState } from 'react'

import { todayISO } from '../../utils/dateHelpers.js'

export function useWorkspaceOrganizePanel({ organize, organizing, addToast }) {
  const [showOrganize, setShowOrganize] = useState(false)
  const [organizeDate, setOrganizeDate] = useState(todayISO())
  const [organizeFromNow, setOrganizeFromNow] = useState(true)

  function toggleOrganize() {
    setShowOrganize(previous => !previous)
  }

  function setOrganizeMode(mode) {
    const shouldStartFromNow = mode === 'now'
    setOrganizeFromNow(shouldStartFromNow)

    if (shouldStartFromNow) {
      setOrganizeDate(todayISO())
    }
  }

  async function handleOrganize() {
    try {
      const data = await organize({
        date: organizeDate,
        start_from_now: organizeFromNow,
      })
      const scheduledCount = data.scheduled?.length ?? 0
      addToast(`Scheduled ${scheduledCount} block${scheduledCount !== 1 ? 's' : ''} on calendar`, 'success')
      return data
    } catch (error) {
      addToast(error.message || 'Push to Calendar failed', 'error')
      throw error
    }
  }

  return {
    showOrganize,
    organizeDate,
    organizeFromNow,
    organizing,
    toggleOrganize,
    setOrganizeDate,
    setOrganizeMode,
    handleOrganize,
  }
}
