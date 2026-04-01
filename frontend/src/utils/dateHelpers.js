// dateHelpers.js — time math and formatting utilities

export function todayISO() {
  return localDateKey(new Date())
}

function padDatePart(n) {
  return String(n).padStart(2, '0')
}

export function localDateKey(input) {
  const d = input instanceof Date ? input : new Date(input)
  return `${d.getFullYear()}-${padDatePart(d.getMonth() + 1)}-${padDatePart(d.getDate())}`
}

export function localDateTimeFromMinutes(dateStr, minute) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setMinutes(minute, 0, 0)
  return d
}

export function nowISO() {
  return new Date().toISOString()
}

// Format ISO datetime → "9:30 AM"
export function formatTime(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch { return isoStr }
}

// Format ISO datetime → "Mon, Mar 26"
export function formatDate(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  } catch { return isoStr }
}

// Format ISO date → "March 26, 2026"
export function formatDateLong(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch { return isoStr }
}

// Minutes since midnight for an ISO datetime string
export function minutesSinceMidnight(isoStr) {
  const d = new Date(isoStr)
  return d.getHours() * 60 + d.getMinutes()
}

// Duration in minutes between two ISO datetime strings
export function durationMinutes(startISO, endISO) {
  return Math.round((new Date(endISO) - new Date(startISO)) / 60000)
}

// Format seconds → "25:00"
export function formatSeconds(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Get the 7 days of the week starting from a given date (YYYY-MM-DD)
export function getWeekDays(startDate) {
  const days = []
  const d = new Date(startDate + 'T00:00:00')
  for (let i = 0; i < 7; i++) {
    const copy = new Date(d)
    copy.setDate(d.getDate() + i)
    days.push(localDateKey(copy))
  }
  return days
}

// Get Monday of the week containing the given date
export function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
  d.setDate(diff)
  return localDateKey(d)
}

// Add days to an ISO date string
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localDateKey(d)
}

// Check if an ISO datetime is "now" (within current calendar event)
export function isCurrentlyActive(startISO, endISO) {
  const now = Date.now()
  return new Date(startISO).getTime() <= now && now < new Date(endISO).getTime()
}

// Format relative time — "in 30 min", "2 hours ago", "tomorrow"
export function formatRelative(dateStr) {
  if (!dateStr) return ''
  const target = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((target - today) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return 'yesterday'
  if (diff > 1 && diff < 7) return `in ${diff} days`
  if (diff < -1) return `${Math.abs(diff)} days ago`
  return formatDate(dateStr)
}
