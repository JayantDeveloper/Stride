const PRIORITY_STYLES = {
  Urgent: 'bg-red-950 text-red-300 border-red-800',
  High:   'bg-orange-950 text-orange-300 border-orange-800',
  Medium: 'bg-yellow-950 text-yellow-300 border-yellow-800',
  Low:    'bg-slate-800 text-slate-400 border-slate-700',
}

const STATUS_STYLES = {
  'Not Started': 'bg-gray-800 text-gray-400 border-gray-700',
  'In Progress': 'bg-blue-950 text-blue-300 border-blue-800',
  'Done':        'bg-green-950 text-green-300 border-green-800',
}

const DIFFICULTY_STYLES = {
  Easy:       'bg-slate-800 text-slate-300 border-slate-700',
  Medium:     'bg-yellow-950 text-yellow-300 border-yellow-800',
  Hard:       'bg-orange-950 text-orange-300 border-orange-800',
  'Very Hard':'bg-red-950 text-red-300 border-red-800',
}

export function PriorityBadge({ priority }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.Medium}`}>
      {priority}
    </span>
  )
}

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[status] ?? STATUS_STYLES['Not Started']}`}>
      {status}
    </span>
  )
}

export function DifficultyBadge({ difficulty }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${DIFFICULTY_STYLES[difficulty] ?? DIFFICULTY_STYLES.Medium}`}>
      {difficulty}
    </span>
  )
}
