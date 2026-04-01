// calendarLayout.js — positions overlapping events in calendar grid

import { minutesSinceMidnight, durationMinutes } from './dateHelpers'

// Default fallback constants (overridden dynamically in views)
export const HOUR_HEIGHT_PX = 80
export const PIXELS_PER_MINUTE = HOUR_HEIGHT_PX / 60
export const TOTAL_HEIGHT_PX = HOUR_HEIGHT_PX * 24

const MIN_HEIGHT_PX = 20

export function eventToPixels(event, pxPerMin = PIXELS_PER_MINUTE) {
  const top = minutesSinceMidnight(event.start_time) * pxPerMin
  const mins = durationMinutes(event.start_time, event.end_time)
  const height = Math.max(mins * pxPerMin, MIN_HEIGHT_PX)
  return { top, height }
}

export function layoutEvents(events, pxPerMin = PIXELS_PER_MINUTE) {
  if (!events.length) return []

  // Augment with numeric timestamps for fast comparison
  const aug = events.map(e => ({
    ...e,
    _start: new Date(e.start_time).getTime(),
    _end: new Date(e.end_time).getTime(),
  })).sort((a, b) => a._start - b._start || b._end - a._end)

  const n = aug.length

  // --- Step 1: Find connected components (clusters of overlapping events) ---
  // Events A and B are in the same cluster if they overlap directly or transitively.
  // This ensures isolated events always get full width.
  const compId = new Array(n).fill(-1)
  let numComps = 0

  for (let i = 0; i < n; i++) {
    if (compId[i] !== -1) continue
    const id = numComps++
    const queue = [i]
    compId[i] = id
    while (queue.length) {
      const ci = queue.shift()
      for (let j = 0; j < n; j++) {
        if (compId[j] !== -1) continue
        if (aug[ci]._start < aug[j]._end && aug[ci]._end > aug[j]._start) {
          compId[j] = id
          queue.push(j)
        }
      }
    }
  }

  // --- Step 2: Assign columns within each cluster ---
  const eventCol = new Map()     // event id → column index
  const clusterCols = new Map()  // component id → total column count

  for (let c = 0; c < numComps; c++) {
    const cluster = aug.filter((_, i) => compId[i] === c)
    const colEnds = [] // endMs of last event placed in each column
    for (const ev of cluster) {
      let col = colEnds.findIndex(end => end <= ev._start)
      if (col === -1) { col = colEnds.length; colEnds.push(0) }
      colEnds[col] = ev._end
      eventCol.set(ev.id, col)
    }
    clusterCols.set(c, colEnds.length)
  }

  // --- Step 3: Compute pixel positions ---
  return aug.map((event, i) => {
    const { top, height } = eventToPixels(event, pxPerMin)
    const col = eventCol.get(event.id) ?? 0
    const totalCols = clusterCols.get(compId[i]) ?? 1
    return {
      ...event,
      top,
      height,
      leftPct: (col / totalCols) * 100,
      widthPct: (1 / totalCols) * 100,
      col,
      totalCols,
    }
  })
}
