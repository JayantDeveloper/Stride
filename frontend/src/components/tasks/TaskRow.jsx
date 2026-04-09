import { useRef, useState } from 'react'
import { Button } from '../shared/Button'
import { todayISO } from '../../utils/dateHelpers'
import { TODO_STATUS_OPTIONS, PRIORITY_OPTIONS, TODO_DIFFICULTY_OPTIONS } from '../../constants/todoBoardConstants'

// ── Shared styles (exported for InlineTaskRow) ─────────────────────────────

export const STATUS_STYLE = {
  'Not Started': { color: '#9CA3AF', bg: 'rgba(107,114,128,0.12)' },
  'In Progress': { color: '#818CF8', bg: 'rgba(99,102,241,0.15)'  },
  'Done':        { color: '#4ADE80', bg: 'rgba(22,163,74,0.15)'   },
}

export const PRIORITY_STYLE = {
  High:   { color: '#FB923C', bg: 'rgba(249,115,22,0.12)' },
  Medium: { color: '#FBBF24', bg: 'rgba(234,179,8,0.12)'  },
  Low:    { color: '#4ADE80', bg: 'rgba(22,163,74,0.12)'  },
  // Legacy fallback for Urgent (tasks created before removal)
  Urgent: { color: '#F87171', bg: 'rgba(239,68,68,0.12)'  },
}

export const DIFFICULTY_STYLE = {
  Easy:      { color: '#4ADE80', bg: 'rgba(22,163,74,0.12)'  },
  Medium:    { color: '#FBBF24', bg: 'rgba(234,179,8,0.12)'  },
  Hard:      { color: '#F87171', bg: 'rgba(239,68,68,0.12)'  },
  'Very Hard':{ color: '#C084FC', bg: 'rgba(168,85,247,0.12)' },
}

// ── Column layout (exported for InlineTaskRow alignment) ───────────────────

export const COL = {
  drag:       { width: 20,  flex: false },
  title:      { width: null, flex: true  },
  status:     { width: 112, flex: false },
  priority:   { width: 96,  flex: false },
  difficulty: { width: 110, flex: false },
  duration:   { width: 90,  flex: false },
  due:        { width: 90,  flex: false },
  split:      { width: 64,  flex: false },
  actions:    { width: 56,  flex: false },
}

export function Cell({ col, children, border = true, onClick, onMouseDown, style: extraStyle, className = '' }) {
  return (
    <div
      onClick={onClick}
      onMouseDown={onMouseDown}
      className={className}
      style={{
        width: COL[col].flex ? undefined : COL[col].width,
        flexShrink: COL[col].flex ? undefined : 0,
        flex: COL[col].flex ? '1 1 0' : undefined,
        minWidth: 0,
        borderRight: border ? '1px solid var(--color-notion-border)' : 'none',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        cursor: onClick ? 'pointer' : undefined,
        ...extraStyle,
      }}
    >
      {children}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtHours(mins) {
  if (!mins) return '—'
  const h = mins / 60
  if (h < 1) return `${Math.round(h * 60)}m`
  const rounded = parseFloat(h.toFixed(1))
  return `${rounded} hour${rounded !== 1 ? 's' : ''}`
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  if (dateStr === todayISO()) return 'today'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const selectStyle = {
  background: 'var(--color-notion-surface)',
  border: '1px solid var(--color-notion-border)',
  color: 'var(--color-notion-text)',
  borderRadius: 6,
  fontSize: 12,
  padding: '2px 4px',
  outline: 'none',
  width: '100%',
}

const inputStyle = {
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--color-notion-border)',
  color: 'var(--color-notion-text)',
  fontSize: 13,
  padding: '1px 0',
  outline: 'none',
  width: '100%',
}

// ── TaskRow ────────────────────────────────────────────────────────────────

export function TaskRow({
  task,
  onEdit,
  onDelete,
  onFieldSave,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  highlight,   // { bg, borderLeft } — used for pomodoro focus/break state
}) {
  const [editingField, setEditingField] = useState(null)
  const [editValue, setEditValue] = useState('')
  const titleInputRef = useRef(null)
  const statusSelectRef = useRef(null)
  const prioritySelectRef = useRef(null)
  const difficultySelectRef = useRef(null)
  const durationInputRef = useRef(null)
  const dueInputRef = useRef(null)

  const status = task.status ?? 'Not Started'
  const priority = task.priority ?? 'Medium'
  const difficulty = task.difficulty ?? 'Medium'
  const statusStyle = STATUS_STYLE[status] ?? STATUS_STYLE['Not Started']
  const priorityStyle = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.Medium
  const diffStyle = DIFFICULTY_STYLE[difficulty] ?? DIFFICULTY_STYLE.Medium

  function startEdit(field, currentValue) {
    setEditingField(field)
    setEditValue(currentValue ?? '')
  }

  function focusEditor(ref, { openPicker = false, moveCaretToEnd = false } = {}) {
    requestAnimationFrame(() => {
      const element = ref.current
      if (!element) return
      element.focus()
      if (moveCaretToEnd && typeof element.setSelectionRange === 'function') {
        const value = String(element.value ?? '')
        element.setSelectionRange(value.length, value.length)
      }
      if (openPicker && typeof element.showPicker === 'function') {
        try {
          element.showPicker()
          return
        } catch {
          // Fall back to focus-only when the browser blocks programmatic open.
        }
      }
      if (openPicker) {
        element.click()
      }
    })
  }

  function openTextEditor(field, currentValue, inputRef) {
    startEdit(field, currentValue)
    focusEditor(inputRef, { moveCaretToEnd: true })
  }

  function openSelectEditor(field, currentValue, selectRef) {
    startEdit(field, currentValue)
    focusEditor(selectRef, { openPicker: true })
  }

  function openDateEditor(field, currentValue, inputRef) {
    startEdit(field, currentValue)
    focusEditor(inputRef, { openPicker: true })
  }

  function handleDragHandleStart(e) {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
    onDragStart?.()
  }

  function commitEdit(field, value) {
    setEditingField(null)
    if (value !== undefined && String(value) !== String(task[field] ?? '')) {
      onFieldSave?.(task.id, field, value)
    }
  }

  function finishCurrentEdit() {
    if (editingField === 'title') commitEdit('title', editValue)
    if (editingField === 'status') commitEdit('status', editValue)
    if (editingField === 'priority') commitEdit('priority', editValue)
    if (editingField === 'difficulty') commitEdit('difficulty', editValue)
    if (editingField === 'duration') commitEdit('estimated_mins', Math.round(parseFloat(editValue || 1) * 60))
    if (editingField === 'due') commitEdit('due_date', editValue || null)
  }

  function handleKeyDown(e, field) {
    if (e.key === 'Enter') commitEdit(field, editValue)
    if (e.key === 'Escape') setEditingField(null)
  }

  const baseStyle = {
    height: 36,
    borderBottom: '1px solid var(--color-notion-border)',
    opacity: isDragging ? 0.5 : 1,
  }
  if (highlight) {
    baseStyle.backgroundColor = highlight.bg
    baseStyle.borderLeft = highlight.borderLeft
  } else {
    baseStyle.backgroundColor = isDragging ? 'var(--color-notion-hover)' : 'transparent'
  }

  return (
    <div
      data-testid={`task-row-${task.id}`}
      onDragOver={e => { e.preventDefault(); onDragOver?.() }}
      onDrop={e => {
        e.preventDefault()
        onDrop?.()
      }}
      className="flex items-stretch"
      style={baseStyle}
    >
      {/* Drag */}
      <Cell col="drag" border className="transition-colors hover:bg-notion-hover">
        <div
          draggable
          onDragStart={handleDragHandleStart}
          onDragEnd={onDragEnd}
          className="h-full w-full flex items-center justify-center cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <span className="text-notion-muted text-xs opacity-40 select-none">⠿</span>
        </div>
      </Cell>

      {/* Title */}
      <Cell
        col="title"
        border
        className="transition-colors hover:bg-notion-hover"
        onMouseDown={e => {
          if (editingField === 'title') return
          if (e.target.closest('button')) return
          if (editingField) finishCurrentEdit()
          e.preventDefault()
          openTextEditor('title', task.title, titleInputRef)
        }}
      >
        {editingField === 'title' ? (
          <input
            ref={titleInputRef}
            style={inputStyle}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => commitEdit('title', editValue)}
            onKeyDown={e => handleKeyDown(e, 'title')}
          />
        ) : (
          <div className="flex items-center gap-2 w-full min-w-0">
            <span className={`text-sm truncate flex-1 min-w-0 ${status === 'Done' ? 'line-through text-notion-muted' : 'text-notion-text'}`}>
              {task.title || 'New task'}
              {task.calendar_event_id && (
                <span className="ml-1.5 text-xs text-indigo-400" title="On calendar">◫</span>
              )}
            </span>
            <button
              type="button"
              className="text-notion-muted hover:text-notion-text text-xl leading-none transition-colors"
              title="Edit notes and all fields"
              onMouseDown={e => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={e => {
                e.stopPropagation()
                if (editingField) finishCurrentEdit()
                onEdit?.(task)
              }}
            >
              ≣
            </button>
          </div>
        )}
      </Cell>

      {/* Status */}
      <Cell
        col="status"
        border
        className="transition-colors hover:bg-notion-hover"
        onMouseDown={e => {
          if (editingField === 'status') return
          if (editingField) finishCurrentEdit()
          e.preventDefault()
          openSelectEditor('status', status, statusSelectRef)
        }}
      >
        {editingField === 'status' ? (
          <select
            ref={statusSelectRef}
            style={selectStyle}
            value={editValue}
            onChange={e => { commitEdit('status', e.target.value) }}
            onBlur={() => setEditingField(null)}
          >
            {TODO_STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : (
          <span
            className="px-2 py-0.5 rounded text-xs font-medium w-full text-center transition-opacity hover:opacity-80"
            style={{ background: statusStyle.bg, color: statusStyle.color }}
          >
            {status}
          </span>
        )}
      </Cell>

      {/* Priority */}
      <Cell
        col="priority"
        border
        className="transition-colors hover:bg-notion-hover"
        onMouseDown={e => {
          if (editingField === 'priority') return
          if (editingField) finishCurrentEdit()
          e.preventDefault()
          openSelectEditor('priority', priority, prioritySelectRef)
        }}
      >
        {editingField === 'priority' ? (
          <select
            ref={prioritySelectRef}
            style={selectStyle}
            value={editValue}
            onChange={e => commitEdit('priority', e.target.value)}
            onBlur={() => setEditingField(null)}
          >
            {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
          </select>
        ) : (
          <span
            className="px-2 py-0.5 rounded text-xs font-medium truncate cursor-pointer hover:opacity-80"
            style={{ background: priorityStyle.bg, color: priorityStyle.color }}
          >
            {priority}
          </span>
        )}
      </Cell>

      {/* Difficulty */}
      <Cell
        col="difficulty"
        border
        className="transition-colors hover:bg-notion-hover"
        onMouseDown={e => {
          if (editingField === 'difficulty') return
          if (editingField) finishCurrentEdit()
          e.preventDefault()
          openSelectEditor('difficulty', difficulty, difficultySelectRef)
        }}
      >
        {editingField === 'difficulty' ? (
          <select
            ref={difficultySelectRef}
            style={selectStyle}
            value={editValue}
            onChange={e => commitEdit('difficulty', e.target.value)}
            onBlur={() => setEditingField(null)}
          >
            {TODO_DIFFICULTY_OPTIONS.map(d => <option key={d}>{d}</option>)}
          </select>
        ) : (
          <span
            className="px-2 py-0.5 rounded text-xs font-medium truncate cursor-pointer hover:opacity-80"
            style={{ background: diffStyle.bg, color: diffStyle.color }}
          >
            {difficulty}
          </span>
        )}
      </Cell>

      {/* Duration */}
      <Cell
        col="duration"
        border
        className="transition-colors hover:bg-notion-hover"
        onMouseDown={e => {
          if (editingField === 'duration') return
          if (editingField) finishCurrentEdit()
          e.preventDefault()
          openTextEditor('duration', task.estimated_mins ? +(task.estimated_mins / 60).toFixed(1) : '', durationInputRef)
        }}
      >
        {editingField === 'duration' ? (
          <input
            ref={durationInputRef}
            type="number"
            min="0.1" max="24" step="0.1"
            style={{ ...inputStyle, width: '100%' }}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => commitEdit('estimated_mins', Math.round(parseFloat(editValue || 1) * 60))}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit('estimated_mins', Math.round(parseFloat(editValue || 1) * 60))
              if (e.key === 'Escape') setEditingField(null)
            }}
            placeholder="hrs"
          />
        ) : (
          <span className="text-xs text-notion-muted cursor-pointer hover:text-notion-text">
            {fmtHours(task.estimated_mins)}
          </span>
        )}
      </Cell>

      {/* Due date */}
      <Cell
        col="due"
        border
        className="transition-colors hover:bg-notion-hover"
        onMouseDown={e => {
          if (editingField === 'due') return
          if (editingField) finishCurrentEdit()
          e.preventDefault()
          openDateEditor('due', task.due_date ?? '', dueInputRef)
        }}
      >
        {editingField === 'due' ? (
          <input
            ref={dueInputRef}
            type="date"
            style={{ ...inputStyle, fontSize: 11 }}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => commitEdit('due_date', editValue || null)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit('due_date', editValue || null)
              if (e.key === 'Escape') setEditingField(null)
            }}
          />
        ) : (
          <span className="text-xs text-notion-muted cursor-pointer hover:text-notion-text truncate">
            {fmtDate(task.due_date)}
          </span>
        )}
      </Cell>

      {/* Split / Solid */}
      <Cell col="split" border className="transition-colors hover:bg-notion-hover">
        <button
          type="button"
          title={task.allow_split ? 'Split: task can be broken across gaps (4-min margins)' : 'Solid: task placed as one uninterrupted block'}
          onClick={() => onFieldSave?.(task.id, 'allow_split', task.allow_split ? 0 : 1)}
          className="w-full text-xs font-medium rounded px-1 py-0.5 transition-colors"
          style={{
            background: task.allow_split ? 'rgba(99,102,241,0.15)' : 'rgba(107,114,128,0.10)',
            color: task.allow_split ? '#818CF8' : '#6B7280',
          }}
        >
          {task.allow_split ? 'Split' : 'Solid'}
        </button>
      </Cell>

      {/* Actions */}
      <Cell col="actions" border={false} className="transition-colors hover:bg-notion-hover">
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="xs" className="text-red-500" onClick={() => onDelete?.(task.id)} title="Delete">✕</Button>
        </div>
      </Cell>
    </div>
  )
}

// ── Column header row ──────────────────────────────────────────────────────

export function TaskListHeader() {
  const headers = [
    { col: 'drag',       label: '' },
    { col: 'title',      label: 'Title' },
    { col: 'status',     label: 'Status' },
    { col: 'priority',   label: 'Priority' },
    { col: 'difficulty', label: 'Difficulty' },
    { col: 'duration',   label: 'Time' },
    { col: 'due',        label: 'Due Date' },
    { col: 'split',      label: 'Cal' },
    { col: 'actions',    label: '' },
  ]
  return (
    <div
      className="flex items-stretch flex-shrink-0"
      style={{
        height: 28,
        borderBottom: '1px solid var(--color-notion-border)',
        background: 'var(--color-notion-surface)',
      }}
    >
      {headers.map(({ col, label }) => (
        <Cell key={col} col={col} border={col !== 'actions'}>
          <span className="text-xs font-medium text-notion-muted uppercase tracking-wide">{label}</span>
        </Cell>
      ))}
    </div>
  )
}
