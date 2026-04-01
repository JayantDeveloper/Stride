import { useEffect, useState } from 'react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { GCAL_COLORS } from '../../constants/calendarConstants'
import { localDateKey } from '../../utils/dateHelpers'

const EMPTY = {
  title: '',
  description: '',
  location: '',
  start_time: '',
  end_time: '',
  all_day: false,
  color_id: '',
}

function toLocalDateTimeInput(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toLocalDateInput(isoStr) {
  if (!isoStr) return ''
  return localDateKey(new Date(isoStr))
}

function localInputToISO(localStr) {
  if (!localStr) return ''
  return new Date(localStr).toISOString()
}

export function CalendarEventModal({ isOpen, onClose, onSave, onDelete, event = null, defaultStart = null, defaultEnd = null, defaultTitle = '' }) {
  const isEditing = !!event
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (event) {
      setForm({
        title: event.title ?? '',
        description: event.description ?? '',
        location: event.location ?? '',
        start_time: toLocalDateTimeInput(event.start_time),
        end_time: toLocalDateTimeInput(event.end_time),
        all_day: !!event.all_day,
        color_id: event.color_id ?? '',
      })
    } else {
      const now = new Date()
      const roundedStart = defaultStart ?? (() => {
        now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0)
        return now.toISOString()
      })()
      const endISO = defaultEnd ?? new Date(new Date(roundedStart).getTime() + 60 * 60 * 1000).toISOString()
      setForm({
        ...EMPTY,
        title: defaultTitle,
        start_time: toLocalDateTimeInput(roundedStart),
        end_time: toLocalDateTimeInput(endISO),
      })
    }
  }, [isOpen, event, defaultStart, defaultEnd, defaultTitle])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description,
        location: form.location,
        start_time: localInputToISO(form.start_time),
        end_time: localInputToISO(form.end_time),
        all_day: form.all_day,
        color_id: form.color_id,
        color: form.color_id || 'blue',
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!event || !onDelete) return
    setDeleting(true)
    try {
      await onDelete(event.id)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  const selectedColor = GCAL_COLORS.find(c => c.id === form.color_id)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit event' : 'New event'} size="md">
      <div className="flex flex-col gap-4">

        {/* Title */}
        <input
          autoFocus
          className="w-full bg-transparent border-0 border-b border-notion-border pb-2 text-lg font-medium text-notion-text placeholder-notion-placeholder focus:outline-none focus:border-indigo-500 transition-colors"
          placeholder="Add title"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />

        {/* All-day toggle + Date/time */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
            <div
              onClick={() => set('all_day', !form.all_day)}
              className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${form.all_day ? 'bg-indigo-600' : 'bg-notion-border'}`}
            >
              <div className={`w-3 h-3 rounded-full bg-white transition-transform ${form.all_day ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
            <span className="text-xs text-notion-muted">All day</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-notion-muted mb-1">Start</label>
              {form.all_day ? (
                <input
                  type="date"
                  className="w-full bg-notion-surface border border-notion-border rounded-lg px-3 py-2 text-sm text-notion-text focus:outline-none focus:border-indigo-500"
                  value={form.start_time ? toLocalDateInput(localInputToISO(form.start_time)) : ''}
                  onChange={e => set('start_time', e.target.value + 'T00:00')}
                />
              ) : (
                <input
                  type="datetime-local"
                  className="w-full bg-notion-surface border border-notion-border rounded-lg px-3 py-2 text-sm text-notion-text focus:outline-none focus:border-indigo-500"
                  value={form.start_time}
                  onChange={e => set('start_time', e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="block text-xs text-notion-muted mb-1">End</label>
              {form.all_day ? (
                <input
                  type="date"
                  className="w-full bg-notion-surface border border-notion-border rounded-lg px-3 py-2 text-sm text-notion-text focus:outline-none focus:border-indigo-500"
                  value={form.end_time ? toLocalDateInput(localInputToISO(form.end_time)) : ''}
                  onChange={e => set('end_time', e.target.value + 'T23:59')}
                />
              ) : (
                <input
                  type="datetime-local"
                  className="w-full bg-notion-surface border border-notion-border rounded-lg px-3 py-2 text-sm text-notion-text focus:outline-none focus:border-indigo-500"
                  value={form.end_time}
                  onChange={e => set('end_time', e.target.value)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-xs text-notion-muted mb-1">Location</label>
          <input
            className="w-full bg-notion-surface border border-notion-border rounded-lg px-3 py-2 text-sm text-notion-text placeholder-notion-placeholder focus:outline-none focus:border-indigo-500"
            placeholder="Add location"
            value={form.location}
            onChange={e => set('location', e.target.value)}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-notion-muted mb-1">Description</label>
          <textarea
            className="w-full bg-notion-surface border border-notion-border rounded-lg px-3 py-2 text-sm text-notion-text placeholder-notion-placeholder focus:outline-none focus:border-indigo-500 resize-none"
            rows={3}
            placeholder="Add description"
            value={form.description}
            onChange={e => set('description', e.target.value)}
          />
        </div>

        {/* Color picker */}
        <div>
          <label className="block text-xs text-notion-muted mb-2">Color</label>
          <div className="flex flex-wrap gap-2">
            {/* "Calendar color" (no override) */}
            <button
              onClick={() => set('color_id', '')}
              className={`w-6 h-6 rounded-full border-2 transition-all bg-indigo-500 ${form.color_id === '' ? 'border-white scale-110' : 'border-transparent'}`}
              title="Default"
            />
            {GCAL_COLORS.map(c => (
              <button
                key={c.id}
                onClick={() => set('color_id', c.id)}
                style={{ backgroundColor: c.hex }}
                className={`w-6 h-6 rounded-full border-2 transition-all ${form.color_id === c.id ? 'border-white scale-110' : 'border-transparent'}`}
                title={c.label}
              />
            ))}
          </div>
          {selectedColor && (
            <p className="text-xs text-notion-muted mt-1">{selectedColor.label}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-notion-border">
          {isEditing && onDelete && (
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!form.title.trim() || saving}
          >
            {saving ? 'Saving…' : isEditing ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
