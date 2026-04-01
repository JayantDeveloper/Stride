import { useRef, useEffect, useState, useMemo } from 'react'
import { CalendarEvent } from './CalendarEvent'
import { layoutEvents } from '../../utils/calendarLayout'
import { TimeGutter } from './TimeGutter'
import { WORK_HOUR_START } from '../../constants/calendarConstants'
import { getWeekDays, localDateKey, localDateTimeFromMinutes, todayISO } from '../../utils/dateHelpers'

const EMPTY_DRAG_IMAGE = typeof Image !== 'undefined'
  ? (() => {
      const image = new Image()
      image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
      return image
    })()
  : null

export function WeekView({ weekStart, events, onEventClick, onEventContextMenu, onSlotClick, onEventDrop }) {
  const containerRef = useRef(null)
  const [draggingId, setDraggingId] = useState(null)
  const [ghostInfo, setGhostInfo] = useState(null) // { day, minute }
  const justDropped = useRef(false)
  const [hourHeight, setHourHeight] = useState(65)
  const [scrollbarW, setScrollbarW] = useState(0)

  const pxPerMin = hourHeight / 60
  const totalHeight = hourHeight * 24
  const draggedEvent = draggingId ? events.find(event => event.id === draggingId) ?? null : null
  const draggedDurationMins = draggedEvent
    ? Math.max(30, Math.round((new Date(draggedEvent.end_time) - new Date(draggedEvent.start_time)) / 60000))
    : 30

  // Dynamically size so 12 hours fill the container.
  // Also measure scrollbar width so the header stays aligned with the grid.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const h = el.clientHeight
      if (h > 100) setHourHeight(Math.max(40, Math.floor(h / 12)))
      setScrollbarW(el.offsetWidth - el.clientWidth)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const days = getWeekDays(weekStart)
  const today = todayISO()
  const nowPx = (new Date().getHours() * 60 + new Date().getMinutes()) * pxPerMin

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = WORK_HOUR_START * hourHeight
    }
  }, [weekStart, hourHeight])

  // Compute events with ghost position applied — the dragged event's time is replaced
  // with where the cursor is hovering, so all columns reflow around the preview
  const displayEvents = useMemo(() => {
    if (!draggingId || !ghostInfo) return events
    const dragged = events.find(e => e.id === draggingId)
    if (!dragged) return events
    const dur = new Date(dragged.end_time) - new Date(dragged.start_time)
    const gs = localDateTimeFromMinutes(ghostInfo.day, ghostInfo.minute)
    return events.map(e => e.id !== draggingId ? e : {
      ...e,
      start_time: gs.toISOString(),
      end_time: new Date(gs.getTime() + dur).toISOString(),
    })
  }, [events, draggingId, ghostInfo])

  function minuteFromClientY(y) {
    const container = containerRef.current
    if (!container) return 0
    const rect = container.getBoundingClientRect()
    const relY = y - rect.top + container.scrollTop
    return Math.max(0, Math.min(1439, Math.round(relY / pxPerMin)))
  }

  function handleColumnClick(e, day) {
    if (draggingId || justDropped.current) return
    const minute = minuteFromClientY(e.clientY)
    const roundedMinute = Math.floor(minute / 30) * 30
    const startDate = new Date(`${day}T00:00:00`)
    startDate.setMinutes(roundedMinute)
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000)
    onSlotClick?.({ start_time: startDate.toISOString(), end_time: endDate.toISOString() }, e)
  }

  function handleDrop(e, day) {
    e.preventDefault()
    const eventId = e.dataTransfer.getData('eventId')
    const originalStart = e.dataTransfer.getData('originalStart')
    const originalEnd = e.dataTransfer.getData('originalEnd')
    if (!eventId) return

    const minute = minuteFromClientY(e.clientY)
    const roundedMinute = Math.floor(minute / 30) * 30

    const durationMs = new Date(originalEnd).getTime() - new Date(originalStart).getTime()
    const newStart = localDateTimeFromMinutes(day, roundedMinute)
    const newEnd = new Date(newStart.getTime() + durationMs)

    onEventDrop?.(eventId, newStart.toISOString(), newEnd.toISOString())
    setDraggingId(null)
    setGhostInfo(null)
    justDropped.current = true
    setTimeout(() => { justDropped.current = false }, 300)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Week header row — pad-right matches scrollbar width so columns stay aligned */}
      <div className="flex flex-shrink-0 border-b border-notion-border" style={{ paddingRight: scrollbarW }}>
        <div className="w-14 flex-shrink-0" />
        {days.map(day => {
          const isToday = day === today
          const d = new Date(day + 'T00:00:00')
          return (
            <div key={day} className="flex-1 text-center py-3 border-l border-notion-border">
              <p className="text-xs text-notion-muted">
                {d.toLocaleDateString('en-US', { weekday: 'short' })}
              </p>
              <div className={`mx-auto mt-0.5 w-8 h-8 flex items-center justify-center rounded-full text-base font-semibold transition-colors ${
                isToday ? 'bg-indigo-600 text-white' : 'text-notion-text'
              }`}>
                {d.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scrollable grid — scrollbar-gutter:stable reserves scrollbar space so header stays aligned */}
      <div ref={containerRef} className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
        <div className="flex" style={{ height: `${totalHeight}px` }}>
          <TimeGutter hourHeight={hourHeight} />

          {days.map(day => {
            const isToday = day === today
            const ds = new Date(day + 'T00:00:00')
            const de = new Date(day + 'T23:59:59')
            const dayEvents = displayEvents.filter(e => {
              const s = new Date(e.start_time)
              const en = new Date(e.end_time)
              return s < de && en > ds
            })
            const laidOut = layoutEvents(dayEvents, pxPerMin)
            const ghostInThisDay = ghostInfo?.day === day

            return (
              <div
                key={day}
                className="flex-1 relative border-l border-notion-border cursor-crosshair transition-colors"
                onClick={e => handleColumnClick(e, day)}
                onDragOver={e => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  const minute = minuteFromClientY(e.clientY)
                  setGhostInfo({ day, minute: Math.floor(minute / 30) * 30 })
                }}
                onDrop={e => handleDrop(e, day)}
              >
                {/* Hour lines */}
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-notion-border/60"
                    style={{ top: `${h * hourHeight}px` }}
                  />
                ))}
                {/* Half-hour lines */}
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={`half-${h}`}
                    className="absolute left-0 right-0 border-t border-notion-border/20 border-dashed"
                    style={{ top: `${h * hourHeight + hourHeight / 2}px` }}
                  />
                ))}

                {/* Snap target highlight while dragging over this column */}
                {draggingId && ghostInThisDay && ghostInfo && (
                  <div
                    className="absolute left-0 right-0 bg-indigo-500/10 border border-indigo-400/50 rounded-sm pointer-events-none z-10"
                    style={{ top: `${ghostInfo.minute * pxPerMin}px`, height: `${draggedDurationMins * pxPerMin}px` }}
                  />
                )}

                {/* Current time indicator */}
                {isToday && (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none flex items-center"
                    style={{ top: `${nowPx}px` }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 -ml-0.5" />
                    <div className="flex-1 h-px bg-red-500 opacity-70" />
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
                      const day = localDateKey(start)
                      setGhostInfo({ day, minute: start.getHours() * 60 + start.getMinutes() })
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('eventId', ev.id)
                      e.dataTransfer.setData('originalStart', ev.start_time)
                      e.dataTransfer.setData('originalEnd', ev.end_time)
                      if (EMPTY_DRAG_IMAGE) {
                        e.dataTransfer.setDragImage(EMPTY_DRAG_IMAGE, 0, 0)
                      }
                    }}
                    onDragEnd={() => { setDraggingId(null); setGhostInfo(null) }}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
