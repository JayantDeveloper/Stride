import { useEffect, useState } from 'react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { PRIORITY_OPTIONS, TODO_DIFFICULTY_OPTIONS, TODO_STATUS_OPTIONS } from '../../constants/todoBoardConstants'
import { useToast } from '../../context/ToastContext'

const EMPTY_TASK = {
  title: 'New task',
  description: '',
  status: 'Not Started',
  priority: 'Medium',
  difficulty: 'Easy',
  estimated_hours: 0.5,   // stored as hours in form, converted to mins on save
  due_date: '',
  scheduled_date: '',     // which day this task is planned for (defaults to today at organize time)
  tags: [],
}

const fieldClass = 'w-full bg-notion-surface border border-notion-border rounded-lg px-3 py-2 text-sm text-notion-text placeholder-notion-placeholder focus:outline-none focus:border-indigo-500 transition-colors'
const labelClass = 'block text-xs font-medium text-notion-muted mb-1'

export function TaskModal({ isOpen, onClose, onSave, task = null }) {
  const isEditing = !!task
  const [form, setForm] = useState(EMPTY_TASK)
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title ?? 'New task',
        description: task.description ?? '',
        status: task.status ?? 'Not Started',
        priority: task.priority ?? 'Medium',
        difficulty: task.difficulty ?? 'Easy',
        estimated_hours: task.estimated_mins ? +(task.estimated_mins / 60).toFixed(2) : 0.5,
        due_date: task.due_date ?? '',
        scheduled_date: task.scheduled_date ?? '',
        tags: task.tags ?? [],
      })
    } else {
      setForm(EMPTY_TASK)
    }
    setTagInput('')
  }, [task, isOpen])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !form.tags.includes(t)) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, t] }))
    }
    setTagInput('')
  }

  function removeTag(tag) {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))
  }

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const hours = parseFloat(form.estimated_hours) || 0.5
      await onSave({
        ...form,
        estimated_mins: Math.round(hours * 60),
        due_date: form.due_date || null,
        scheduled_date: form.scheduled_date || null,
      })
      onClose()
    } catch (error) {
      addToast(error.message || 'Failed to save task', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit task' : 'New task'} size="md">
      <div className="flex flex-col gap-4">

        {/* Title */}
        <input
          autoFocus
          className="w-full bg-transparent border-0 border-b border-notion-border pb-2 text-lg font-medium text-notion-text placeholder-notion-placeholder focus:outline-none focus:border-indigo-500 transition-colors"
          placeholder="New task"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />

        {/* Description */}
        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            className={fieldClass + ' resize-none'}
            rows={2}
            placeholder="Add notes…"
            value={form.description}
            onChange={e => set('description', e.target.value)}
          />
        </div>

        {/* Priority + Status */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Priority</label>
            <select className={fieldClass} value={form.priority} onChange={e => set('priority', e.target.value)}>
              {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select className={fieldClass} value={form.status} onChange={e => set('status', e.target.value)}>
              {TODO_STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Difficulty + Estimated time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Difficulty</label>
            <select className={fieldClass} value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
              {TODO_DIFFICULTY_OPTIONS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Est. time (hours)</label>
            <input
              type="number"
              min="0.1" max="12" step="0.1"
              className={fieldClass}
              value={form.estimated_hours}
              onChange={e => set('estimated_hours', e.target.value)}
              placeholder="e.g. 1.5"
            />
          </div>
        </div>

        {/* Scheduled date + Due date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Day (for scheduling)</label>
            <input
              type="date"
              className={fieldClass}
              value={form.scheduled_date ?? ''}
              onChange={e => set('scheduled_date', e.target.value)}
              placeholder="Defaults to today"
            />
            <p className="text-xs text-notion-muted mt-1">Leave blank = today</p>
          </div>
          <div>
            <label className={labelClass}>Due date</label>
            <input
              type="date"
              className={fieldClass}
              value={form.due_date ?? ''}
              onChange={e => set('due_date', e.target.value)}
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className={labelClass}>Tags</label>
          {form.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-2">
              {form.tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-notion-muted"
                  style={{ background: 'var(--color-notion-hover)', border: '1px solid var(--color-notion-border)' }}
                >
                  #{tag}
                  <button onClick={() => removeTag(tag)} className="text-notion-muted hover:text-red-400 leading-none">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className={fieldClass}
              placeholder="Add a tag…"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
            />
            <Button variant="secondary" size="sm" onClick={addTag}>Add</Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--color-notion-border)' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!form.title.trim() || saving}
          >
            {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create task'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
