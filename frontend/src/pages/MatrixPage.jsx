// MatrixPage — Eisenhower matrix view. Tasks live in four quadrants defined by
// (important, urgent); drag a card into a quadrant to set both flags at once.
import { useMemo, useState } from 'react'
import { useTasks } from '../hooks/useTasks'
import { Spinner } from '../components/shared/Spinner'

const QUADRANTS = [
  { key: 'do',        important: 1, urgent: 1, title: 'Do First',          sub: 'Urgent · Important',        accent: '#EF4444', tint: 'rgba(239,68,68,0.06)' },
  { key: 'schedule',  important: 1, urgent: 0, title: 'Schedule',          sub: 'Important · Not urgent',    accent: '#3B82F6', tint: 'rgba(59,130,246,0.06)' },
  { key: 'delegate',  important: 0, urgent: 1, title: 'Delegate / Quick',  sub: 'Urgent · Not important',    accent: '#F59E0B', tint: 'rgba(245,158,11,0.06)' },
  { key: 'eliminate', important: 0, urgent: 0, title: 'Eliminate / Later',  sub: 'Not urgent · Not important', accent: '#9CA3AF', tint: 'rgba(156,163,175,0.05)' },
]

const PRIORITY_COLOR = { Urgent: '#F87171', High: '#FB923C', Medium: '#FBBF24', Low: '#34D399' }

function fmtMins(m) {
  if (!m) return null
  if (m < 60) return `${m}m`
  const h = m / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`
}

function TaskCard({ task, onDragStart, onDragEnd, dragging }) {
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(task.id) }}
      onDragEnd={onDragEnd}
      className="rounded-md border px-2.5 py-2 cursor-grab active:cursor-grabbing select-none transition-opacity"
      style={{
        borderColor: 'var(--color-notion-border)',
        background: 'var(--color-notion-bg)',
        opacity: dragging ? 0.4 : 1,
      }}
      title={task.title}
    >
      <div className="text-[13px] leading-snug line-clamp-2" style={{ color: 'var(--color-notion-text)' }}>
        {task.title || 'Untitled'}
      </div>
      <div className="flex items-center gap-2 mt-1 text-[11px]" style={{ color: 'var(--color-notion-muted)' }}>
        <span style={{ color: PRIORITY_COLOR[task.priority] || 'var(--color-notion-muted)' }}>● {task.priority}</span>
        {fmtMins(task.estimated_mins) && <span>{fmtMins(task.estimated_mins)}</span>}
        {task.status === 'In Progress' && <span style={{ color: '#818CF8' }}>· in progress</span>}
        {task.due_date && <span>· due {String(task.due_date).slice(5, 10)}</span>}
      </div>
    </div>
  )
}

export default function MatrixPage() {
  const { tasks, loading, updateTask } = useTasks()
  const [draggingId, setDraggingId] = useState(null)
  const [hoverKey, setHoverKey] = useState(null)

  const active = useMemo(() => tasks.filter((t) => t.status !== 'Done'), [tasks])

  const byQuadrant = useMemo(() => {
    const map = { do: [], schedule: [], delegate: [], eliminate: [] }
    for (const t of active) {
      const imp = t.important ? 1 : 0
      const urg = t.urgent ? 1 : 0
      const q = QUADRANTS.find((x) => x.important === imp && x.urgent === urg)
      if (q) map[q.key].push(t)
    }
    return map
  }, [active])

  function onDrop(e, q) {
    e.preventDefault()
    setHoverKey(null)
    const id = e.dataTransfer.getData('text/plain')
    setDraggingId(null)
    const t = tasks.find((x) => x.id === id)
    if (!t) return
    const nextImp = q.important, nextUrg = q.urgent
    if ((t.important ? 1 : 0) === nextImp && (t.urgent ? 1 : 0) === nextUrg) return
    updateTask(id, { important: nextImp, urgent: nextUrg })
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Spinner size="lg" /></div>
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 gap-3 overflow-hidden">
      <div className="flex items-baseline gap-3 flex-shrink-0">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-notion-text)' }}>Eisenhower Matrix</h2>
        <span className="text-xs" style={{ color: 'var(--color-notion-muted)' }}>
          {active.length} active tasks · drag a card into a quadrant to reclassify
        </span>
      </div>

      <div className="grid grid-cols-2 grid-rows-2 gap-3 flex-1 min-h-0">
        {QUADRANTS.map((q) => {
          const items = byQuadrant[q.key]
          const hovering = hoverKey === q.key
          return (
            <div
              key={q.key}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (hoverKey !== q.key) setHoverKey(q.key) }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHoverKey((k) => (k === q.key ? null : k)) }}
              onDrop={(e) => onDrop(e, q)}
              className="flex flex-col min-h-0 rounded-lg border transition-colors"
              style={{
                borderColor: hovering ? q.accent : 'var(--color-notion-border)',
                background: hovering ? q.tint : 'transparent',
                boxShadow: hovering ? `inset 0 0 0 1px ${q.accent}` : 'none',
              }}
            >
              <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-notion-border)' }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: q.accent }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-notion-text)' }}>{q.title}</span>
                  <span className="text-[11px]" style={{ color: 'var(--color-notion-muted)' }}>{q.sub}</span>
                </div>
                <span className="text-xs tabular-nums px-1.5 rounded" style={{ color: 'var(--color-notion-muted)', background: 'var(--color-notion-hover)' }}>{items.length}</span>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1.5" style={{ background: q.tint }}>
                {items.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-[12px] italic" style={{ color: 'var(--color-notion-muted)' }}>
                    Drop tasks here
                  </div>
                ) : (
                  items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      dragging={draggingId === t.id}
                      onDragStart={setDraggingId}
                      onDragEnd={() => setDraggingId(null)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
