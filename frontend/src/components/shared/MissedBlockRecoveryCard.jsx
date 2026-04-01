import { Button } from './Button'
import { formatTime } from '../../utils/dateHelpers'

function timingLabel(block) {
  const start = new Date(block.start_time)
  const end = new Date(block.end_time)
  const now = new Date()
  const missedMins = Math.max(1, Math.round((now.getTime() - end.getTime()) / 60000))
  const dayLabel = start.toDateString() === now.toDateString()
    ? 'today'
    : start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return `Missed ${dayLabel} · ${formatTime(block.start_time)}–${formatTime(block.end_time)} · ${missedMins}m ago`
}

function slotLabel(slot, fallback) {
  if (!slot) return fallback
  const start = new Date(slot.start_time)
  const dayPrefix = start.toDateString() === new Date().toDateString()
    ? 'Today'
    : start.toLocaleDateString('en-US', { weekday: 'short' })
  return `${dayPrefix} ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}`
}

export function MissedBlockRecoveryCard({
  block,
  recommendation,
  aiLoading = false,
  actionLoading = '',
  onDismiss,
  onStartSprintNow,
  onMoveToNextOpenSlot,
  onDeferToTomorrow,
}) {
  if (!block) return null

  return (
    <div className="rounded-xl border border-notion-border bg-notion-surface px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-300">Recovery</p>
            <p className="text-xs text-notion-muted truncate">{timingLabel(block)}</p>
          </div>
          <p className="mt-1 text-sm font-semibold text-notion-text truncate">{block.task_title ?? block.title}</p>
          <p className="mt-1 text-sm text-notion-muted leading-relaxed">
            {recommendation?.card_text || recommendation?.message || (aiLoading ? 'Preparing recovery options...' : 'Choose the fastest way to get this block back on track.')}
          </p>
          {recommendation?.reason && (
            <p className="mt-1 text-xs text-notion-muted">{recommendation.reason}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-notion-muted hover:text-notion-text hover:bg-notion-hover transition-colors flex-shrink-0"
          title="Dismiss"
        >
          ×
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={onStartSprintNow}
          disabled={actionLoading !== '' || aiLoading}
        >
          {actionLoading === 'start' ? 'Starting...' : 'Start 10-min sprint now'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onMoveToNextOpenSlot}
          disabled={actionLoading !== '' || !block.recovery_options?.move_next_open_slot}
          title={slotLabel(block.recovery_options?.move_next_open_slot, 'No later slot available today')}
        >
          {actionLoading === 'move' ? 'Moving...' : 'Move to next open slot'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onDeferToTomorrow}
          disabled={actionLoading !== '' || !block.recovery_options?.defer_tomorrow}
          title={slotLabel(block.recovery_options?.defer_tomorrow, 'No open slot found tomorrow')}
        >
          {actionLoading === 'defer' ? 'Deferring...' : 'Defer to tomorrow'}
        </Button>
      </div>
    </div>
  )
}
