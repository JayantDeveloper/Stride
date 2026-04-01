import { useMemo, useState } from 'react'
import { GCAL_COLORS, EVENT_TYPE_HEX, getEventHex } from '../../constants/calendarConstants'

const EMPTY_DRAG_IMAGE = typeof Image !== 'undefined'
  ? (() => {
      const image = new Image()
      image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
      return image
    })()
  : null

function getMonthGrid(year, month) {
  // Returns 6-week grid of Date objects
  const firstDay = new Date(year, month, 1)
  const startDay = new Date(firstDay)
  startDay.setDate(startDay.getDate() - firstDay.getDay()) // go back to Sunday

  const days = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDay)
    d.setDate(startDay.getDate() + i)
    days.push(d)
  }
  return days
}

function isoDate(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function eventHex(event) {
  return getEventHex(event, GCAL_COLORS, EVENT_TYPE_HEX)
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function MonthView({ year, month, events, onDayClick, onEventClick, onEventContextMenu }) {
  const today = isoDate(new Date())
  const days = useMemo(() => getMonthGrid(year, month), [year, month])
  const [draggingEventId, setDraggingEventId] = useState(null)

  function openEventMenu(e, event) {
    e.preventDefault()
    e.stopPropagation()
    onEventContextMenu?.(e, event)
  }

  // Group events by date, sorted by start time for consistent ordering
  const byDate = useMemo(() => {
    const map = {}
    for (const ev of events) {
      const dateStr = (ev.start_time ?? '').split('T')[0]
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(ev)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    }
    return map
  }, [events])

  function handleDragStart(e, event) {
    setDraggingEventId(event.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('eventId', event.id)
    if (EMPTY_DRAG_IMAGE) {
      e.dataTransfer.setDragImage(EMPTY_DRAG_IMAGE, 0, 0)
    }
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e, day) {
    e.preventDefault()
    const eventId = e.dataTransfer.getData('eventId')
    if (!eventId) return
    // Surface to CalendarPage for actual update
    onDayClick?.('drop', isoDate(day), eventId)
    setDraggingEventId(null)
  }

  return (
    <div className="flex flex-col h-full select-none">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-notion-border flex-shrink-0">
        {DAY_LABELS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-notion-muted">
            {d}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-hidden">
        {days.map((day, idx) => {
          const dateStr = isoDate(day)
          const isCurrentMonth = day.getMonth() === month
          const isToday = dateStr === today
          const dayEvents = byDate[dateStr] ?? []

          return (
            <div
              key={idx}
              className={`min-h-0 border-b border-r border-notion-border flex flex-col p-1 cursor-pointer transition-colors
                ${isCurrentMonth ? 'bg-notion-bg' : 'bg-notion-surface'}
                hover:bg-notion-hover
              `}
              onClick={() => onDayClick?.('select', dateStr)}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, day)}
            >
              {/* Date number */}
              <div className="flex items-center justify-center mb-1">
                <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full transition-colors
                  ${isToday ? 'bg-indigo-600 text-white' : isCurrentMonth ? 'text-notion-text' : 'text-notion-placeholder'}
                `}>
                  {day.getDate()}
                </span>
              </div>

              {/* Events — show up to 3, then +N more */}
              <div className="flex flex-col gap-px overflow-hidden flex-1">
                {dayEvents.slice(0, 3).map(ev => (
                  <div
                    key={ev.id}
                    draggable
                    onDragStart={e => { e.stopPropagation(); handleDragStart(e, ev) }}
                    onClick={e => {
                      e.stopPropagation()
                      if (e.ctrlKey || e.metaKey) {
                        openEventMenu(e, ev)
                        return
                      }
                      onEventClick?.(ev)
                    }}
                    onMouseUp={e => {
                      if (e.button === 2) {
                        openEventMenu(e, ev)
                      }
                    }}
                    onContextMenu={e => openEventMenu(e, ev)}
                    className={`truncate text-xs px-1 py-px rounded cursor-pointer transition-opacity
                      ${draggingEventId === ev.id ? 'opacity-40' : 'hover:opacity-80'}
                    `}
                    style={{
                      backgroundColor: eventHex(ev) + '33',
                      color: eventHex(ev),
                      borderLeft: `2px solid ${eventHex(ev)}`,
                    }}
                    title={ev.title}
                  >
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-xs text-notion-muted px-1">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
