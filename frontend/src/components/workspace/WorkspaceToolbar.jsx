import { Button } from '../shared/Button'

const FILTERS = [
  { key: 'active', label: 'Active', countKey: 'active' },
  { key: 'done', label: 'Done', countKey: 'done' },
  { key: 'all', label: 'All', countKey: 'all' },
]

export function WorkspaceToolbar({
  filterStatus,
  sortBy,
  counts,
  showOrganize,
  onFilterStatusChange,
  onSortByChange,
  onToggleOrganize,
  onAddTask,
}) {
  return (
    <div
      className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5"
      style={{ borderBottom: '1px solid var(--color-notion-border)' }}
    >
      <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--color-notion-border)' }}>
        {FILTERS.map(filter => (
          <button
            key={filter.key}
            onClick={() => onFilterStatusChange(filter.key)}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              filterStatus === filter.key ? 'text-notion-text bg-notion-hover' : 'text-notion-muted hover:text-notion-text'
            }`}
          >
            {filter.label} ({counts[filter.countKey] ?? 0})
          </button>
        ))}
      </div>

      <select
        className="text-xs bg-notion-surface border border-notion-border rounded-md px-2 py-1 text-notion-muted focus:outline-none"
        value={sortBy}
        onChange={event => onSortByChange(event.target.value)}
      >
        <option value="position">Manual order</option>
        <option value="priority">By priority</option>
        <option value="duration">By duration</option>
      </select>

      <div className="flex-1" />

      <Button
        variant={showOrganize ? 'primary' : 'secondary'}
        size="sm"
        onClick={onToggleOrganize}
      >
        {showOrganize ? 'Hide calendar push' : 'Push to Calendar'}
      </Button>

      <Button variant="primary" size="sm" onClick={onAddTask}>
        + Task
      </Button>
    </div>
  )
}
