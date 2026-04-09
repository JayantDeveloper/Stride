import { useEffect, useRef, useState } from 'react'
import { Cell, STATUS_STYLE, PRIORITY_STYLE, DIFFICULTY_STYLE } from './TaskRow'
import { TODO_STATUS_OPTIONS, PRIORITY_OPTIONS, TODO_DIFFICULTY_OPTIONS } from '../../constants/todoBoardConstants'

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

// task is an already-created DB record. onSave updates it. onCancel exits inline editing.
export function InlineTaskRow({ task, onSave, onCancel }) {
  const [form, setForm] = useState({
    title:           task.title ?? 'New task',
    status:          task.status ?? 'Not Started',
    priority:        task.priority ?? 'Low',
    difficulty:      task.difficulty ?? 'Medium',
    estimated_hours: task.estimated_mins ? task.estimated_mins / 60 : 1,
    due_date:        task.due_date ?? '',
    allow_split:     task.allow_split ?? 1,
  })
  const titleRef = useRef(null)
  const saving = useRef(false)

  useEffect(() => {
    const input = titleRef.current
    if (!input) return
    input.focus()
    const value = String(input.value ?? '')
    input.setSelectionRange(value.length, value.length)
  }, [])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (saving.current) return
    saving.current = true
    try {
      await onSave({
        title:         form.title.trim(),
        status:        form.status,
        priority:      form.priority,
        difficulty:    form.difficulty,
        estimated_mins: Math.round((parseFloat(form.estimated_hours) || 1) * 60),
        due_date:      form.due_date || null,
        allow_split:   form.allow_split ? 1 : 0,
      })
    } catch {
      saving.current = false
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') void handleSave()
    if (e.key === 'Escape') onCancel()
  }

  const statusStyle   = STATUS_STYLE[form.status]     ?? STATUS_STYLE['Not Started']
  const priorityStyle = PRIORITY_STYLE[form.priority] ?? PRIORITY_STYLE.Low
  const diffStyle     = DIFFICULTY_STYLE[form.difficulty] ?? DIFFICULTY_STYLE.Medium

  return (
    <div
      data-testid={`inline-task-row-${task.id}`}
      className="flex items-stretch"
      onBlur={(e) => {
        if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return
        const container = e.currentTarget
        requestAnimationFrame(() => {
          if (container.contains(document.activeElement)) return
          void handleSave()
        })
      }}
      style={{
        height: 36,
        borderBottom: '1px solid var(--color-notion-border)',
        background: 'var(--color-notion-hover)',
      }}
    >
      <Cell col="drag" border>
        <span className="text-notion-muted text-xs opacity-20 select-none">⠿</span>
      </Cell>

      <Cell col="title" border>
        <input
          ref={titleRef}
          style={inputStyle}
          placeholder="New task"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </Cell>

      <Cell col="status" border>
        <select
          style={{ ...selectStyle, background: statusStyle.bg, color: statusStyle.color, border: 'none' }}
          value={form.status}
          onChange={e => set('status', e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onCancel()}
        >
          {TODO_STATUS_OPTIONS.map(s => <option key={s} style={{ background: '#202020', color: '#e6e6e6' }}>{s}</option>)}
        </select>
      </Cell>

      <Cell col="priority" border>
        <select
          style={{ ...selectStyle, background: priorityStyle.bg, color: priorityStyle.color, border: 'none' }}
          value={form.priority}
          onChange={e => set('priority', e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onCancel()}
        >
          {PRIORITY_OPTIONS.map(p => <option key={p} style={{ background: '#202020', color: '#e6e6e6' }}>{p}</option>)}
        </select>
      </Cell>

      <Cell col="difficulty" border>
        <select
          style={{ ...selectStyle, background: diffStyle.bg, color: diffStyle.color, border: 'none' }}
          value={form.difficulty}
          onChange={e => set('difficulty', e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onCancel()}
        >
          {TODO_DIFFICULTY_OPTIONS.map(d => <option key={d} style={{ background: '#202020', color: '#e6e6e6' }}>{d}</option>)}
        </select>
      </Cell>

      <Cell col="duration" border>
        <input
          type="number"
          min="0.1" max="24" step="0.1"
          style={{ ...inputStyle, fontSize: 12 }}
          placeholder="1h"
          value={form.estimated_hours}
          onChange={e => set('estimated_hours', e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </Cell>

      <Cell col="due" border>
        <input
          type="date"
          style={{ ...inputStyle, fontSize: 11 }}
          value={form.due_date}
          onChange={e => set('due_date', e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </Cell>

      <Cell col="split" border>
        <button
          type="button"
          title={form.allow_split ? 'Split: task can be broken across gaps (4-min margins)' : 'Solid: task placed as one uninterrupted block'}
          onClick={() => set('allow_split', form.allow_split ? 0 : 1)}
          className="w-full text-xs font-medium rounded px-1 py-0.5 transition-colors"
          style={{
            background: form.allow_split ? 'rgba(99,102,241,0.15)' : 'rgba(107,114,128,0.10)',
            color: form.allow_split ? '#818CF8' : '#6B7280',
          }}
        >
          {form.allow_split ? 'Split' : 'Solid'}
        </button>
      </Cell>

      <Cell col="actions" border={false}>
        <button
          onClick={onCancel}
          style={{ fontSize: 14, color: 'var(--color-notion-muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
          title="Done editing (Esc)"
        >
          ✓
        </button>
      </Cell>
    </div>
  )
}
