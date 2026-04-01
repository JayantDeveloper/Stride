import { useState } from 'react'
import { Button } from '../components/shared/Button'
import { Spinner } from '../components/shared/Spinner'
import { AIPlanDisplay } from '../components/planning/AIPlanDisplay'
import { useDailyLog } from '../hooks/useDailyLog'
import { useToast } from '../context/ToastContext'
import { todayISO, formatDateLong } from '../utils/dateHelpers'

export default function PlanningPage() {
  const today = todayISO()
  const isMorning = new Date().getHours() < 14
  const { log, loading, saving, updateNote, generateAIPlan, generateEveningReview, parsedPlan } = useDailyLog(today)
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState(isMorning ? 'morning' : 'evening')
  const [morningNote, setMorningNote] = useState('')
  const [generating, setGenerating] = useState(false)

  async function handleGeneratePlan() {
    setGenerating(true)
    try {
      await updateNote('morning_note', morningNote)
      await generateAIPlan(morningNote)
      addToast('Day plan generated!', 'success')
    } catch (err) {
      addToast(err.message || 'AI planning failed', 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleGenerateReview() {
    setGenerating(true)
    try {
      await generateEveningReview()
      addToast('Evening review ready', 'success')
    } catch (err) {
      addToast(err.message || 'Review generation failed', 'error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Daily Plan</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatDateLong(today)}</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-900 border border-gray-800 rounded-lg overflow-hidden mb-6 w-fit">
        <button
          onClick={() => setActiveTab('morning')}
          className={`px-5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'morning' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          ◑ Morning
        </button>
        <button
          onClick={() => setActiveTab('evening')}
          className={`px-5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'evening' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          ◐ Evening Review
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : activeTab === 'morning' ? (
        <div className="flex flex-col gap-5">
          {/* Morning priorities */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">What are your top priorities today?</h2>
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
              rows={4}
              placeholder="e.g., Finish the auth bug fix, prep for team sync, review open PRs..."
              value={morningNote || log?.morning_note || ''}
              onChange={e => setMorningNote(e.target.value)}
            />
            <div className="flex justify-end mt-3">
              <Button onClick={handleGeneratePlan} disabled={generating || saving}>
                {generating ? <><Spinner size="sm" /> Generating…</> : 'Generate AI Plan'}
              </Button>
            </div>
          </div>

          {/* AI Plan output */}
          {parsedPlan && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-300 mb-4">AI Suggested Schedule</h2>
              <AIPlanDisplay plan={parsedPlan} />
            </div>
          )}

          {!parsedPlan && !generating && (
            <div className="text-center py-8 text-gray-600">
              <p className="text-3xl mb-2">◑</p>
              <p className="text-sm">Describe your priorities above and generate a plan.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Evening notes */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">How did today go?</h2>
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
              rows={3}
              placeholder="Optional: notes about what happened today..."
              defaultValue={log?.evening_note ?? ''}
              onBlur={e => updateNote('evening_note', e.target.value)}
            />
            <div className="flex justify-end mt-3">
              <Button onClick={handleGenerateReview} disabled={generating}>
                {generating ? <><Spinner size="sm" /> Reviewing…</> : '◐ Generate Review'}
              </Button>
            </div>
          </div>

          {/* AI Review */}
          {log?.ai_review ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-gray-300">AI Review</span>
                <span className="text-xs text-gray-600">• claude-sonnet-4-6</span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{log.ai_review}</p>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-600">
              <p className="text-3xl mb-2">◐</p>
              <p className="text-sm">Generate a review to see how your day went.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
