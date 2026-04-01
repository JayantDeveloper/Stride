import { useEffect, useState } from 'react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { Spinner } from '../shared/Spinner'
import { useAIScheduling } from '../../hooks/useAIScheduling'
import { useCalendarEvents } from '../../hooks/useCalendarEvents'
import { useToast } from '../../context/ToastContext'
import { formatTime, todayISO } from '../../utils/dateHelpers'

export function AddToCalendarModal({ isOpen, onClose, task }) {
  const [suggestions, setSuggestions] = useState([])
  const [selecting, setSelecting] = useState(null)
  const { loading: aiLoading, suggestSlots } = useAIScheduling()
  const { createEvent } = useCalendarEvents()
  const { addToast } = useToast()

  useEffect(() => {
    if (isOpen && task) {
      setSuggestions([])
      suggestSlots({ taskId: task.id, date: todayISO() })
        .then(slots => setSuggestions(slots))
        .catch(err => addToast(err.message, 'error'))
    }
  }, [isOpen, task?.id])

  async function handleSelect(slot) {
    setSelecting(slot)
    try {
      await createEvent({
        title: `[Task] ${task.title}`,
        description: task.description ?? '',
        start_time: slot.start_time,
        end_time: slot.end_time,
        task_id: task.id,
      })
      addToast('Task scheduled on calendar!', 'success')
      onClose()
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setSelecting(null)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add to Calendar" size="md">
      <div className="flex flex-col gap-4">
        {task && (
          <div className="bg-gray-800 rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-gray-100">{task.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">{task.estimated_mins ?? 30} min • {task.priority} priority</p>
          </div>
        )}

        {aiLoading && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Spinner />
            <p className="text-sm text-gray-400">Finding best time slots…</p>
          </div>
        )}

        {!aiLoading && suggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Suggested slots</p>
            {suggestions.map((slot, i) => (
              <button
                key={i}
                onClick={() => handleSelect(slot)}
                disabled={!!selecting}
                className="w-full text-left bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-indigo-600 rounded-lg px-4 py-3 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-100">
                    {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                  </span>
                  {selecting === slot ? (
                    <Spinner size="sm" />
                  ) : (
                    <span className="text-xs text-indigo-400">Select →</span>
                  )}
                </div>
                {slot.reason && (
                  <p className="text-xs text-gray-400">{slot.reason}</p>
                )}
              </button>
            ))}
          </div>
        )}

        {!aiLoading && suggestions.length === 0 && (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">No available slots found for today.</p>
            <p className="text-xs text-gray-600 mt-1">Try syncing your calendar or checking another day.</p>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-gray-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}
