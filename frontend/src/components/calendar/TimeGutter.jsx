import { HOUR_LABELS, WORK_HOUR_START, WORK_HOUR_END } from '../../constants/calendarConstants'
import { HOUR_HEIGHT_PX } from '../../utils/calendarLayout'

export function TimeGutter({ hourHeight = HOUR_HEIGHT_PX }) {
  return (
    <div className="flex flex-col flex-shrink-0 w-14 select-none">
      {HOUR_LABELS.map((label, i) => (
        <div
          key={i}
          className="flex-shrink-0 flex items-start justify-end pr-2 text-right"
          style={{ height: `${hourHeight}px` }}
        >
          <span className={`text-xs leading-none -mt-1.5 ${
            i >= WORK_HOUR_START && i <= WORK_HOUR_END ? 'text-notion-muted' : 'text-notion-muted/40'
          }`}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
