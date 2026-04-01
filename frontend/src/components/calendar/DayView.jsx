import { useRef, useEffect, useState, useMemo } from 'react'
import { TimeGutter } from './TimeGutter'
import { CalendarEvent } from './CalendarEvent'
import { layoutEvents } from '../../utils/calendarLayout'
import { WORK_HOUR_START, WORK_HOUR_END } from '../../constants/calendarConstants'
import { formatDate, localDateTimeFromMinutes, todayISO } from '../../utils/dateHelpers'

const EMPTY_DRAG_IMAGE = typeof Image !== 'undefined'
  ? (() => {
      const image = new Image()
      image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
      return image
    })()
  : null

export function DayView({ date, events, onEventClick, onEventContextMenu, onSlotClick, onEventDrop }) {
  const containerRef = useRef(null)
  const [draggingId, setDraggingId] = useState(null)
  const [ghostMinute, setGhostMinute] = useState(null)
  const justDropped = useRef(false)
  const [hourHeight, setHourHeight] = useState(65)

  const pxPerMin = hourHeight / 60
  const totalHeight = hourHeight * 24
  const draggedEvent = draggingId ? events.find(event => event.id === draggingId) ?? null : null
  const draggedDurationMins = draggedEvent
    ? Math.max(30, Math.round((new Date(draggedEvent.end_time) - new Date(draggedEvent.start_time)) / 60000))
    : 30

  // Dynamically size so 12 hours fill the container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const h = el.clientHeight
      if (h > 100) setHourHeight(Math.max(40, Math.floor(h / 12)))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Compute layout — when dragging, replace the event's time with the ghost position
  // so all other events reflow around the preview location
  const laidOut = useMemo(() => {
    let evts = events
    if (draggingId !== null && ghostMinute !== null) {
      evts = events.map(e => {
        if (e.id !== draggingId) return e
        const dur = new Date(e.end_time) - new Date(e.start_time)
        const gs = localDateTimeFromMinutes(date, ghostMinute)
        return { ...e, start_time: gs.toISOString(), end_time: new Date(gs.getTime() + dur).toISOString() }
      })
    }
    const ds = new Date(date + 'T00:00:00')
    const de = new Date(date + 'T23:59:59')
    return layoutEvents(evts.filter(e => {
      const s = new Date(e.start_time)
      const en = new Date(e.end_time)
      return s < de && en > ds
    }), pxPerMin)
  }, [events, draggingId, ghostMinute, date, pxPerMin])

  // Scroll to current time on mount
  useEffect(() => {
    if (containerRef.current) {
      const nowHour = new Date().getHours()
      const scrollHour = Math.max(nowHour - 1, WORK_HOUR_START)
      containerRef.current.scrollTop = scrollHour * hourHeight
    }
  }, [date, hourHeight])

  const isToday = date === todayISO()
  const nowPx = isToday
    ? (new Date().getHours() * 60 + new Date().getMinutes()) * pxPerMin
    : null

  function minuteFromClientY(y) {
    const container = containerRef.current
    if (!container) return 0
    const rect = container.getBoundingClientRect()
    const relY = y - rect.top + container.scrollTop
    return Math.max(0, Math.min(1439, Math.round(relY / pxPerMin)))
  }

  function handleColumnClick(e) {
    if (draggingId || justDropped.current) return
    const minute = minuteFromClientY(e.clientY)
    const roundedMinute = Math.floor(minute / 30) * 30
    const startDate = new Date(`${date}T00:00:00`)
    startDate.setMinutes(roundedMinute)
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000)
    onSlotClick?.({ start_time: startDate.toISOString(), end_time: endDate.toISOString() }, e)
  }

  function handleDrop(e) {
    e.preventDefault()
    const eventId = e.dataTransfer.getData('eventId')
    const originalStart = e.dataTransfer.getData('originalStart')
    const originalEnd = e.dataTransfer.getData('originalEnd')
    if (!eventId) return

    const minute = minuteFromClientY(e.clientY)
    const roundedMinute = Math.floor(minute / 30) * 30

    const durationMs = new Date(originalEnd).getTime() - new Date(originalStart).getTime()
    const newStart = localDateTimeFromMinutes(date, roundedMinute)
    const newEnd = new Date(newStart.getTime() + durationMs)

    onEventDrop?.(eventId, newStart.toISOString(), newEnd.toISOString())
    setDraggingId(null)
    setGhostMinute(null)
    justDropped.current = true
    setTimeout(() => { justDropped.current = false }, 300)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Day header */}
      <div className="flex-shrink-0 pl-14 py-3 border-b border-notion-border">
        <p className={`text-sm font-semibold ${isToday ? 'text-indigo-400' : 'text-notion-text'}`}>
          {isToday ? 'Today' : formatDate(date)}
        </p>
      </div>

      {/* Scrollable time grid */}
      <div ref={containerRef} className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
        <div className="flex" style={{ height: `${totalHeight}px`, minHeight: `${totalHeight}px` }}>
          <TimeGutter hourHeight={hourHeight} />

          <div
            className="flex-1 relative border-l border-notion-border cursor-crosshair"
            onClick={handleColumnClick}
            onDragOver={e => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              const minute = minuteFromClientY(e.clientY)
              setGhostMinute(Math.floor(minute / 30) * 30)
            }}
            onDrop={handleDrop}
          >
            {/* Hour lines */}
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className={`absolute left-0 right-0 border-t ${
                  h >= WORK_HOUR_START && h <= WORK_HOUR_END ? 'border-notion-border' : 'border-notion-border/40'
                }`}
                style={{ top: `${h * hourHeight}px` }}
              />
            ))}
            {/* Half-hour lines */}
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={`half-${h}`}
                className="absolute left-0 right-0 border-t border-notion-border/30 border-dashed"
                style={{ top: `${h * hourHeight + hourHeight / 2}px` }}
              />
            ))}

            {/* Snap target highlight while dragging */}
            {draggingId && ghostMinute !== null && (
              <div
                className="absolute left-0 right-0 bg-indigo-500/10 border border-indigo-400/50 rounded-sm pointer-events-none z-10"
                style={{ top: `${ghostMinute * pxPerMin}px`, height: `${draggedDurationMins * pxPerMin}px` }}
              />
            )}

            {/* Current time indicator */}
            {nowPx !== null && (
              <div
                className="absolute left-0 right-0 z-10 flex items-center pointer-events-none"
                style={{ top: `${nowPx}px` }}
              >
                <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
                <div className="flex-1 h-px bg-red-500 opacity-80" />
              </div>
            )}

            {laidOut.map(event => (
              <CalendarEvent
                key={event.id}
                event={event}
                style={{ top: `${event.top}px`, height: `${event.height}px` }}
                onClick={onEventClick}
                onContextMenu={onEventContextMenu}
                isDragging={draggingId === event.id}
                onDragStart={(e, ev) => {
                  setDraggingId(ev.id)
                  const start = new Date(ev.start_time)
                  setGhostMinute(start.getHours() * 60 + start.getMinutes())
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('eventId', ev.id)
                  e.dataTransfer.setData('originalStart', ev.start_time)
                  e.dataTransfer.setData('originalEnd', ev.end_time)
                  if (EMPTY_DRAG_IMAGE) {
                    e.dataTransfer.setDragImage(EMPTY_DRAG_IMAGE, 0, 0)
                  }
                }}
                onDragEnd={() => { setDraggingId(null); setGhostMinute(null) }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
