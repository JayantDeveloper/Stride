import { Button } from '../shared/Button'
import { Spinner } from '../shared/Spinner'

const ORGANIZE_MODES = [
  {
    key: 'now',
    label: 'From now',
    description: 'Schedule tasks starting from right now, skipping past time',
  },
  {
    key: 'full',
    label: 'Full day',
    description: 'Schedule tasks from 8am on the chosen date',
  },
]

export function WorkspaceOrganizePanel({
  organizeFromNow,
  organizeDate,
  organizing,
  onModeChange,
  onDateChange,
  onSubmit,
}) {
  return (
    <div
      className="flex-shrink-0 flex flex-col gap-2 px-4 py-2.5"
      style={{ borderBottom: '1px solid var(--color-notion-border)', background: 'var(--color-notion-hover)' }}
    >
      <div className="flex gap-1.5">
        {ORGANIZE_MODES.map(mode => {
          const isActive = organizeFromNow === (mode.key === 'now')

          return (
            <button
              key={mode.key}
              onClick={() => onModeChange(mode.key)}
              title={mode.description}
              className="flex-1 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                border: '1px solid var(--color-notion-border)',
                background: isActive ? '#6366F1' : 'transparent',
                color: isActive ? '#fff' : 'var(--color-notion-muted)',
                cursor: 'pointer',
              }}
            >
              {mode.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-notion-muted">
          {organizeFromNow ? 'Today' : 'Schedule for'}
        </span>
        <input
          type="date"
          className="bg-notion-surface border border-notion-border rounded-lg px-2 py-1 text-xs text-notion-text focus:outline-none focus:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
          value={organizeDate}
          disabled={organizeFromNow}
          onChange={event => onDateChange(event.target.value)}
        />
        <div className="flex-1" />
        <Button variant="primary" size="sm" onClick={onSubmit} disabled={organizing}>
          {organizing ? <><Spinner size="sm" /> Scheduling...</> : 'Push'}
        </Button>
      </div>
    </div>
  )
}
