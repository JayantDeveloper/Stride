import { useState } from 'react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { Spinner } from '../shared/Spinner'
import { useCheckin } from '../../hooks/useCheckin'
import { useAIScheduling } from '../../hooks/useAIScheduling'

const OUTCOMES = [
  {
    id: 'finished',
    label: '✓ Finished',
    description: 'Task is done',
    color: 'border-green-700 hover:border-green-500 hover:bg-green-950',
    active: 'border-green-500 bg-green-950',
  },
  {
    id: 'partial',
    label: '◑ Partial Progress',
    description: 'Made progress, not done',
    color: 'border-blue-800 hover:border-blue-600 hover:bg-blue-950',
    active: 'border-blue-600 bg-blue-950',
  },
  {
    id: 'blocked',
    label: '⛔ Blocked',
    description: 'Something is in the way',
    color: 'border-orange-800 hover:border-orange-600 hover:bg-orange-950',
    active: 'border-orange-600 bg-orange-950',
  },
  {
    id: 'skipped',
    label: '⏭ Skipped',
    description: 'Didn\'t work on it',
    color: 'border-gray-700 hover:border-gray-500 hover:bg-gray-800',
    active: 'border-gray-500 bg-gray-800',
  },
]

export function CheckInModal({ isOpen, onClose, taskId, taskTitle, sessionId, onOutcomeSubmitted, onReschedule }) {
  const [outcome, setOutcome] = useState(null)
  const [notes, setNotes] = useState('')
  const [aiMessage, setAiMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const { loading: submitLoading, submitCheckin } = useCheckin()
  const { loading: aiLoading, getCheckinResponse } = useAIScheduling()

  async function handleSubmit() {
    if (!outcome) return

    // Get AI response first (non-blocking if it fails)
    const ai = await getCheckinResponse({ taskId, taskTitle, outcome, notes })

    // Record check-in
    await submitCheckin({ sessionId, taskId, outcome, notes, aiFollowup: ai })

    setAiMessage(ai)
    setSubmitted(true)
    onOutcomeSubmitted?.({ outcome, notes, aiMessage: ai })
  }

  function handleClose() {
    setOutcome(null)
    setNotes('')
    setAiMessage('')
    setSubmitted(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Session Complete" size="md">
      {!submitted ? (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm text-gray-400 mb-1">How did it go with:</p>
            <p className="text-sm font-semibold text-gray-100">{taskTitle || 'your task'}</p>
          </div>

          {/* Outcome buttons */}
          <div className="grid grid-cols-2 gap-2">
            {OUTCOMES.map(o => (
              <button
                key={o.id}
                onClick={() => setOutcome(o.id)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  outcome === o.id ? o.active : `bg-transparent ${o.color}`
                }`}
              >
                <p className="text-sm font-medium text-gray-200">{o.label}</p>
                <p className="text-xs text-gray-500">{o.description}</p>
              </button>
            ))}
          </div>

          {/* Notes */}
          {outcome && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {outcome === 'blocked' ? 'What\'s blocking you?' : 'Any notes?'} (optional)
              </label>
              <textarea
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                rows={2}
                placeholder={outcome === 'blocked' ? 'Describe the blocker…' : 'What happened?'}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
            <Button variant="ghost" onClick={handleClose}>Skip</Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!outcome || submitLoading || aiLoading}
            >
              {submitLoading || aiLoading ? <><Spinner size="sm" /> Submitting…</> : 'Submit'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="text-center py-2">
            <div className="text-3xl mb-2">
              {outcome === 'finished' ? '🎉' : outcome === 'partial' ? '📈' : outcome === 'blocked' ? '🔧' : '⏭'}
            </div>
            <p className="text-sm font-semibold text-gray-100 capitalize">{outcome}</p>
          </div>

          {aiMessage && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500 mb-1.5">AI Coach</p>
              <p className="text-sm text-gray-200 leading-relaxed">{aiMessage}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
            {(outcome === 'blocked' || outcome === 'skipped') && onReschedule && (
              <Button variant="secondary" onClick={() => { handleClose(); onReschedule(taskId) }}>
                Reschedule
              </Button>
            )}
            <Button variant="primary" onClick={handleClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
