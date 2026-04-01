import { PriorityBadge, DifficultyBadge } from '../shared/Badge'
import { Button } from '../shared/Button'
import { formatRelative } from '../../utils/dateHelpers'

export function NextUpCard({ task, onMarkDone, onSkip, onEdit }) {
  if (!task) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
        <p className="text-4xl mb-3">✓</p>
        <p className="text-gray-400 text-sm">All caught up! No tasks pending.</p>
        <a href="/tasks" className="text-indigo-400 text-sm hover:underline mt-2 inline-block">
          Add a task →
        </a>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Priority bar at top */}
      <div className={`h-1 ${
        task.priority === 'Urgent' ? 'bg-red-500' :
        task.priority === 'High'   ? 'bg-orange-400' :
        task.priority === 'Medium' ? 'bg-yellow-400' : 'bg-gray-600'
      }`} />

      <div className="p-6">
        {/* Label */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Next up</span>
          <PriorityBadge priority={task.priority} />
          <DifficultyBadge difficulty={task.difficulty} />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-100 mb-2 leading-tight">{task.title}</h2>

        {/* Description */}
        {task.description && (
          <p className="text-sm text-gray-400 mb-3 leading-relaxed">{task.description}</p>
        )}

        {/* Metadata */}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-5">
          {task.estimated_mins && <span>⏱ {task.estimated_mins} min</span>}
          {task.due_date && <span>📅 Due {formatRelative(task.due_date)}</span>}
          {task.tags?.length > 0 && (
            <span>{task.tags.map(t => `#${t}`).join(' ')}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button variant="success" size="sm" onClick={() => onMarkDone?.(task)}>
            ✓ Mark Done
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onSkip?.(task)}>
            Skip
          </Button>
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={() => onEdit(task)}>
              Edit
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
