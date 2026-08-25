import { memo } from 'react'
import { formatTime } from '../../utils/dateHelpers'
import { GCAL_COLORS, EVENT_TYPE_HEX, getEventHex } from '../../constants/calendarConstants'

function eventHex(event) {
  return getEventHex(event, GCAL_COLORS, EVENT_TYPE_HEX)
}

export const CalendarEvent = memo(function CalendarEvent({ event, style, onClick, onContextMenu, onDragStart, onDragEnd, isDragging }) {
  const hex = eventHex(event)
  const bgAlpha = '26'  // ~15% opacity for glass effect
  const borderAlpha = 'AA' // ~67% for left border

  function openEventMenu(e) {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu?.(e, event)
  }

  return (
    <div
      draggable
      onDragStart={e => onDragStart?.(e, event)}
      onDragEnd={onDragEnd}
      onClick={e => {
        e.stopPropagation()
        if (e.ctrlKey || e.metaKey) {
          openEventMenu(e)
          return
        }
        onClick?.(event)
      }}
      onMouseUp={e => {
        if (e.button === 2) {
          openEventMenu(e)
        }
      }}
      onContextMenu={openEventMenu}
      className={`absolute rounded overflow-hidden cursor-pointer transition-all
        ${isDragging ? 'opacity-40 ring-2 ring-indigo-400/40' : 'hover:brightness-125'}
      `}
      style={{
        ...style,
        zIndex: isDragging ? 30 : 1,
        left: `calc(${event.leftPct ?? 0}% + 2px)`,
        width: `calc(${event.widthPct ?? 100}% - 4px)`,
        // 20px forced every sub-20-minute block to overlap the next one at
        // normal zoom. 13px fits one line of text; anything shorter shows the
        // colour bar alone, which is still a legible signal.
        minHeight: '13px',
        backgroundColor: hex + bgAlpha,
        borderLeft: `3px solid ${hex + borderAlpha}`,
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        boxShadow: `0 1px 3px rgba(0,0,0,0.3), inset 0 0 0 1px ${hex}22`,
      }}
    >
      <div className="px-1.5 py-0.5 overflow-hidden h-full">
        <p className="text-xs font-semibold leading-tight truncate" style={{ color: hex }}>
          {event.title}
        </p>
        {event.height >= 34 && (
          <p className="text-xs leading-tight opacity-70 truncate" style={{ color: hex }}>
            {formatTime(event.start_time)} – {formatTime(event.end_time)}
          </p>
        )}
        {event.height >= 58 && event.location && (
          <p className="text-xs leading-tight opacity-60 truncate" style={{ color: hex }}>
            {event.location}
          </p>
        )}
      </div>
    </div>
  )
})