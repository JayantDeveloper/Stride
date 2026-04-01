// calendarConstants.js — event type colors and view configuration

// Vivid palette for auto-assigned event colors (exclude graphite)
const VIVID_IDS = ['tomato','flamingo','tangerine','banana','sage','basil','peacock','blueberry','lavender','grape']

function hashStr(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

// Palette for task blocks created by "Push to Calendar" — picked to avoid collision with external event colors
export const TASK_BLOCK_COLORS = ['#6366F1', '#A855F7', '#F59E0B', '#EC4899', '#14B8A6', '#EF4444', '#F97316']

// Returns hex color for any event — consistent across month/week/day views
export function getEventHex(event, GCAL_COLORS_REF, EVENT_TYPE_HEX_REF) {
  // Direct hex stored in color field (used by Push to Calendar / organize feature)
  if (event.color?.startsWith('#')) return event.color

  if (event.color_id) {
    const c = GCAL_COLORS_REF.find(c => c.id === event.color_id)
    if (c) return c.hex
  }
  if (event.event_type && event.event_type !== 'external') {
    return EVENT_TYPE_HEX_REF[event.event_type] ?? EVENT_TYPE_HEX_REF.external
  }
  // Auto-assign vivid color by title
  const vivid = GCAL_COLORS_REF.filter(c => VIVID_IDS.includes(c.id))
  return vivid[hashStr(event.title ?? event.id ?? '') % vivid.length]?.hex ?? '#4F46E5'
}

// 11 Google Calendar colors (name → hex + label)
export const GCAL_COLORS = [
  { id: 'tomato',    label: 'Tomato',    hex: '#D50000' },
  { id: 'flamingo',  label: 'Flamingo',  hex: '#E67C73' },
  { id: 'tangerine', label: 'Tangerine', hex: '#F4511E' },
  { id: 'banana',    label: 'Banana',    hex: '#F6BF26' },
  { id: 'sage',      label: 'Sage',      hex: '#33B679' },
  { id: 'basil',     label: 'Basil',     hex: '#0B8043' },
  { id: 'peacock',   label: 'Peacock',   hex: '#039BE5' },
  { id: 'blueberry', label: 'Blueberry', hex: '#3F51B5' },
  { id: 'lavender',  label: 'Lavender',  hex: '#7986CB' },
  { id: 'grape',     label: 'Grape',     hex: '#8E24AA' },
  { id: 'graphite',  label: 'Graphite',  hex: '#616161' },
]

// Default hex by event_type (when no color_id is set)
export const EVENT_TYPE_HEX = Object.freeze({
  external:      '#4A5568',   // muted slate
  task_block:    '#4F46E5',   // indigo-600
  focus_session: '#7C3AED',   // violet-600
  completed:     '#16A34A',   // green-600
  missed:        '#DC2626',   // red-600
})

export const CALENDAR_VIEWS = Object.freeze(['month', 'week', 'day'])

export const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 === 0 ? 12 : i % 12
  const ampm = i < 12 ? 'AM' : 'PM'
  return `${h} ${ampm}`
})

// Work hours for display emphasis
export const WORK_HOUR_START = 8   // 8 AM
export const WORK_HOUR_END = 19    // 7 PM
