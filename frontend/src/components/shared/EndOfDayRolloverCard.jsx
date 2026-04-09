import { Button } from './Button'

function taskSummary(rollover) {
  const taskCount = rollover?.affected_task_count ?? 0
  const blockCount = rollover?.today_block_count ?? 0

  if (taskCount <= 0 && blockCount <= 0) {
    return 'Move unfinished work into tomorrow and clear out tonight’s leftover blocks.'
  }

  return `Move ${taskCount} unfinished task${taskCount === 1 ? '' : 's'} and ${blockCount} remaining block${blockCount === 1 ? '' : 's'} into tomorrow’s schedule.`
}

export function EndOfDayRolloverCard({
  rollover,
  actionLoading = '',
  onMoveToTomorrow,
}) {
  return (
    <div className="rounded-xl border border-notion-border bg-notion-surface px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">End of day</p>
            {rollover?.tomorrow_date && (
              <p className="text-xs text-notion-muted truncate">Shift unfinished work to {rollover.tomorrow_date}</p>
            )}
          </div>
          <p className="mt-1 text-sm font-semibold text-notion-text truncate">Wrap today and reset tomorrow</p>
          <p className="mt-1 text-sm text-notion-muted leading-relaxed">
            {taskSummary(rollover)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={onMoveToTomorrow}
          disabled={actionLoading !== ''}
        >
          {actionLoading === 'rollover' ? 'Moving...' : 'Move unfinished work to tomorrow'}
        </Button>
      </div>
    </div>
  )
}
