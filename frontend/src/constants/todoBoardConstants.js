export const TODO_DIFFICULTY_OPTIONS = Object.freeze(['Easy', 'Medium', 'Hard', 'Very Hard'])

export const TODO_STATUS_OPTIONS = Object.freeze(['Not Started', 'In Progress', 'Done'])

export const PRIORITY_OPTIONS = Object.freeze(['Urgent', 'High', 'Medium', 'Low'])

export const OUTCOME_OPTIONS = Object.freeze(['finished', 'partial', 'blocked', 'skipped'])

// Priority sort order (lower = higher priority)
export const PRIORITY_ORDER = Object.freeze({ Urgent: 0, High: 1, Medium: 2, Low: 3 })

export const DIFFICULTY_LABELS = Object.freeze({
  Easy:      { label: 'Easy',      color: 'text-slate-400' },
  Medium:    { label: 'Medium',    color: 'text-yellow-400' },
  Hard:      { label: 'Hard',      color: 'text-orange-400' },
  'Very Hard': { label: 'Very Hard', color: 'text-red-400' },
})
