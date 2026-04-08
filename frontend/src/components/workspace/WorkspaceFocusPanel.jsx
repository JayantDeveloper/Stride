import { Button } from '../shared/Button'
import { ExecutionPomodoro } from '../execute/ExecutionPomodoro'

const PRIORITY_ACCENT = {
  High: { border: '#F97316', bg: 'rgba(249,115,22,0.10)', label: '#FB923C' },
  Medium: { border: '#4F46E5', bg: 'rgba(79,70,229,0.10)', label: '#818CF8' },
  Low: { border: '#4ADE80', bg: 'rgba(22,163,74,0.10)', label: '#4ADE80' },
  Urgent: { border: '#EF4444', bg: 'rgba(239,68,68,0.10)', label: '#F87171' },
}

function formatDuration(mins) {
  if (!mins) return null
  const hours = mins / 60
  if (hours < 1) return `${Math.round(hours * 60)}m`
  const rounded = parseFloat(hours.toFixed(1))
  return `${rounded} hour${rounded !== 1 ? 's' : ''}`
}

function cleanStepLabel(step) {
  return String(step ?? '').replace(/^\d+\.\s+/, '').trim()
}

export function WorkspaceFocusPanel({
  rightPct,
  activeTask,
  pomodoroMode,
  timerStartRequest,
  activationLoadingAction,
  breakdownSteps,
  currentSubtaskIndex,
  currentSprintGoal,
  onPomodoroModeChange,
  onBeforeFocusStart,
  onTimerStartHandled,
  onSessionComplete,
  onBreakdown,
  onPreviousSprintGoal,
  onNextSprintGoal,
  onCompleteTask,
}) {
  const accent = PRIORITY_ACCENT[activeTask?.priority] ?? PRIORITY_ACCENT.Medium
  const canMoveBackward = activationLoadingAction === '' && currentSubtaskIndex > 0
  const canAdvance = activationLoadingAction === ''
  const isFinalSprintStep = currentSubtaskIndex >= breakdownSteps.length - 1

  return (
    <div
      className="flex-shrink-0 min-h-0 flex flex-col overflow-hidden"
      style={{ width: `${rightPct}%`, background: 'var(--color-notion-surface)' }}
    >
      <div className="flex-1 min-h-0 flex items-center justify-center px-4 py-6">
        <div className="w-full">
          <ExecutionPomodoro
            taskId={activeTask?.id ?? null}
            onModeChange={onPomodoroModeChange}
            onBeforeFocusStart={onBeforeFocusStart}
            externalStartRequest={timerStartRequest}
            onExternalStartHandled={onTimerStartHandled}
            onSessionComplete={onSessionComplete}
          />
        </div>
      </div>

      <div
        className="flex-shrink-0 min-h-0 max-h-[40vh] overflow-y-auto mx-4 mb-4 rounded-xl p-4"
        style={{
          background: activeTask ? accent.bg : 'var(--color-notion-hover)',
          border: `1px solid ${activeTask ? `${accent.border}60` : 'var(--color-notion-border)'}`,
        }}
      >
        {activeTask ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: accent.label }}>
              Now focusing
            </p>
            <p className="text-sm font-semibold text-notion-text leading-snug truncate">{activeTask.title}</p>
            <p className="text-xs mt-1" style={{ color: `${accent.label}aa` }}>
              {activeTask.priority}
              {formatDuration(activeTask.estimated_mins) && ` · ${formatDuration(activeTask.estimated_mins)}`}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="xs"
                onClick={() => { void onBreakdown() }}
                disabled={activationLoadingAction !== ''}
              >
                {activationLoadingAction === 'breakdown'
                  ? 'Breaking down...'
                  : breakdownSteps.length > 0
                    ? 'Regenerate subtasks'
                    : 'Break down'}
              </Button>
            </div>

            {breakdownSteps.length > 0 && (
              <div className="mt-3 rounded-lg border border-notion-border bg-notion-hover px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-notion-muted">Breakdown</p>
                <div className="mt-1 flex flex-col gap-1">
                  {breakdownSteps.map((step, index) => (
                    <p
                      key={`${activeTask.id}-${index}`}
                      className={`text-sm ${
                        index === currentSubtaskIndex ? 'text-notion-text font-medium' : 'text-notion-muted'
                      }`}
                    >
                      {index + 1}. {cleanStepLabel(step)}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-notion-muted">Focus panel</p>
            <p className="mt-2 text-sm text-notion-muted">
              No active task. Create or start one from the left pane.
            </p>
          </div>
        )}
      </div>

      {currentSprintGoal && !pomodoroMode.isBreak && (
        <div className="flex-shrink-0 px-4 pb-4">
          <div className="rounded-xl border border-notion-border bg-notion-hover px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Sprint goal</p>
              {breakdownSteps.length > 0 && (
                <p className="text-xs text-notion-muted">
                  {Math.min(currentSubtaskIndex + 1, breakdownSteps.length)} of {breakdownSteps.length}
                </p>
              )}
              <div className="flex-1" />
            </div>
            <p className="mt-1 text-sm text-notion-text leading-relaxed">{currentSprintGoal}</p>
            {breakdownSteps.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => { void onPreviousSprintGoal() }}
                  disabled={!canMoveBackward}
                >
                  Previous
                </Button>
                {isFinalSprintStep ? (
                  <Button
                    variant="success"
                    size="xs"
                    onClick={() => { void onCompleteTask() }}
                    disabled={!canAdvance}
                  >
                    Complete task
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    onClick={() => { void onNextSprintGoal() }}
                    disabled={!canAdvance}
                  >
                    Next sprint goal
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
