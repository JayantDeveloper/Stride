import { Button } from '../components/shared/Button'
import { Spinner } from '../components/shared/Spinner'
import { useAnalytics } from '../hooks/useAnalytics'
import { todayISO } from '../utils/dateHelpers'

export default function AnalyticsPage() {
  const { summary, trends, loading, reload } = useAnalytics()
  const today = todayISO()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  const f = summary?.focus ?? {}
  const t = summary?.tasks ?? {}
  const outcomes = summary?.checkin_outcomes ?? {}

  const maxFocusMins = trends.reduce((m, d) => Math.max(m, d.focus_mins), 0) || 1
  const maxTasks = trends.reduce((m, d) => Math.max(m, d.tasks_completed), 0) || 1

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Last 7 days</p>
        </div>
        <Button variant="secondary" size="sm" onClick={reload}>↻ Refresh</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Tasks Done" value={t.completed ?? 0} color="text-green-400" />
        <StatCard label="Focus Sessions" value={f.total_sessions ?? 0} color="text-indigo-400" />
        <StatCard label="Focus Time" value={`${Math.round((f.total_focus_mins ?? 0) / 60 * 10) / 10}h`} color="text-purple-400" />
        <StatCard label="Completion Rate" value={f.total_sessions ? `${Math.round((f.completed_sessions / f.total_sessions) * 100)}%` : '—'} color="text-teal-400" />
      </div>

      {/* Focus time chart */}
      {trends.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Focus Minutes per Day</h2>
          <div className="flex items-end gap-2 h-32">
            {trends.map(day => {
              const height = (day.focus_mins / maxFocusMins) * 100
              const isToday = day.date === today
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t transition-all ${isToday ? 'bg-indigo-500' : 'bg-indigo-900 hover:bg-indigo-700'}`}
                    style={{ height: `${Math.max(height, day.focus_mins > 0 ? 4 : 0)}%` }}
                    title={`${day.focus_mins} min`}
                  />
                  <span className="text-xs text-gray-600 truncate w-full text-center">
                    {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tasks completed chart */}
      {trends.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Tasks Completed per Day</h2>
          <div className="flex items-end gap-2 h-24">
            {trends.map(day => {
              const height = (day.tasks_completed / maxTasks) * 100
              const isToday = day.date === today
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t transition-all ${isToday ? 'bg-green-500' : 'bg-green-900 hover:bg-green-700'}`}
                    style={{ height: `${Math.max(height, day.tasks_completed > 0 ? 4 : 0)}%` }}
                    title={`${day.tasks_completed} tasks`}
                  />
                  <span className="text-xs text-gray-600 truncate w-full text-center">
                    {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Check-in outcomes breakdown */}
      {Object.keys(outcomes).length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Session Outcomes</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(outcomes).map(([outcome, count]) => (
              <div key={outcome} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                <span className="text-sm">
                  {outcome === 'finished' ? '✓' : outcome === 'partial' ? '◑' : outcome === 'blocked' ? '⛔' : '⏭'}
                </span>
                <span className="text-sm text-gray-300 capitalize">{outcome}</span>
                <span className="text-sm font-bold text-gray-100">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!summary?.focus?.total_sessions && !summary?.tasks?.completed && (
        <div className="text-center py-12 text-gray-600">
          <p className="text-3xl mb-2">▦</p>
          <p className="text-sm">No data yet. Complete some focus sessions to see your analytics.</p>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}
