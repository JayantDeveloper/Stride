// MatrixPage — Eisenhower matrix view. Tasks live in four quadrants defined by
// (important, urgent); drag a card into a quadrant to set both flags at once.
//
// The switch in the top right flips to Task mode, which drops the quadrants and
// lists every active task ordered by priority. Both panes stay mounted and
// cross-fade so the transition reads the same in either direction.
import { useEffect, useMemo, useState } from 'react'
import { useTasks } from '../hooks/useTasks'
import { Spinner } from '../components/shared/Spinner'
import { useToast } from '../context/ToastContext'

const QUADRANTS = [
  { key: 'do',        important: 1, urgent: 1, title: 'Do First',          sub: 'Urgent · Important',        accent: '#EF4444', tint: 'rgba(239,68,68,0.06)' },
  { key: 'schedule',  important: 1, urgent: 0, title: 'Schedule',          sub: 'Important · Not urgent',    accent: '#3B82F6', tint: 'rgba(59,130,246,0.06)' },
  { key: 'delegate',  important: 0, urgent: 1, title: 'Delegate / Quick',  sub: 'Urgent · Not important',    accent: '#F59E0B', tint: 'rgba(245,158,11,0.06)' },
  { key: 'eliminate', important: 0, urgent: 0, title: 'Eliminate / Later',  sub: 'Not urgent · Not important', accent: '#9CA3AF', tint: 'rgba(156,163,175,0.05)' },
]

const MENU_WIDTH = 160
const MENU_HEIGHT = 44
const VIEWPORT_PADDING = 12

const PRIORITY_COLOR = { Urgent: '#F87171', High: '#FB923C', Medium: '#FBBF24', Low: '#34D399' }
// Highest first. Anything with an unrecognised priority sorts to the end.
const PRIORITY_ORDER = ['Urgent', 'High', 'Medium', 'Low']

function fmtMins(m) {
  if (!m) return null
  if (m < 60) return `${m}m`
  const h = m / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`
}

// Which quadrant a task currently sits in, for the badge in Task mode.
function quadrantOf(task) {
  const imp = task.important ? 1 : 0
  const urg = task.urgent ? 1 : 0
  return QUADRANTS.find((q) => q.important === imp && q.urgent === urg) ?? null
}

// Sort by due date, soonest first, with undated tasks last.
function byDueDate(a, b) {
  if (a.due_date && b.due_date) return String(a.due_date).localeCompare(String(b.due_date))
  if (a.due_date) return -1
  if (b.due_date) return 1
  return 0
}

function TaskCard({ task, onDragStart, onDragEnd, dragging, onContextMenu }) {
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(task.id) }}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => onContextMenu(e, task)}
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

// One row in Task mode. Wider than the quadrant card, so it carries the
// quadrant it came from rather than hiding that information.
function TaskRow({ task, onContextMenu }) {
  const q = quadrantOf(task)
  return (
    <div
      onContextMenu={(e) => onContextMenu(e, task)}
      className="flex items-center gap-3 rounded-md border px-3 py-2 select-none transition-colors hover:bg-[var(--color-notion-hover)]"
      style={{ borderColor: 'var(--color-notion-border)', background: 'var(--color-notion-bg)' }}
      title={task.title}
    >
      <span
        className="w-1.5 h-8 rounded-full flex-shrink-0"
        style={{ background: PRIORITY_COLOR[task.priority] || 'var(--color-notion-muted)' }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] leading-snug truncate" style={{ color: 'var(--color-notion-text)' }}>
          {task.title || 'Untitled'}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px]" style={{ color: 'var(--color-notion-muted)' }}>
          {q && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: q.accent }} />
              {q.title}
            </span>
          )}
          {fmtMins(task.estimated_mins) && <span>· {fmtMins(task.estimated_mins)}</span>}
          {task.status === 'In Progress' && <span style={{ color: '#818CF8' }}>· in progress</span>}
        </div>
      </div>
      {task.due_date && (
        <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: 'var(--color-notion-muted)' }}>
          due {String(task.due_date).slice(5, 10)}
        </span>
      )}
    </div>
  )
}

// Two-state segmented switch. The sliding thumb is a single absolutely
// positioned element so the movement animates rather than snapping.
function ModeSwitch({ mode, onChange }) {
  const options = [
    { key: 'matrix', label: 'Matrix' },
    { key: 'tasks',  label: 'Tasks' },
  ]
  return (
    <div
      role="tablist"
      aria-label="Matrix view mode"
      className="relative flex items-center p-0.5 rounded-lg border flex-shrink-0"
      style={{ borderColor: 'var(--color-notion-border)', background: 'var(--color-notion-surface)' }}
    >
      <span
        aria-hidden="true"
        className="absolute top-0.5 bottom-0.5 rounded-md transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{
          width: 'calc(50% - 2px)',
          left: 2,
          background: 'var(--color-notion-bg)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
          transform: mode === 'tasks' ? 'translateX(100%)' : 'translateX(0)',
        }}
      />
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={mode === o.key}
          onClick={() => onChange(o.key)}
          className="relative z-10 px-3 py-1 text-xs font-medium rounded-md transition-colors motion-reduce:transition-none"
          style={{ color: mode === o.key ? 'var(--color-notion-text)' : 'var(--color-notion-muted)', minWidth: 64 }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function MatrixPage() {
  const { tasks, loading, updateTask, deleteTask, undoDelete } = useTasks()
  const { addToast } = useToast()
  const [draggingId, setDraggingId] = useState(null)
  const [hoverKey, setHoverKey] = useState(null)
  const [menu, setMenu] = useState(null)   // { task, x, y }
  const [mode, setMode] = useState('matrix')  // 'matrix' | 'tasks'

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onEscape = (e) => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('contextmenu', close)
      document.removeEventListener('keydown', onEscape)
    }
  }, [menu])

  // Cmd/Ctrl+Z restores the last deleted task, matching the calendar.
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoDelete()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [undoDelete])

  function openMenu(e, task) {
    e.preventDefault()
    e.stopPropagation()
    // Keep the menu inside the viewport when right-clicking near an edge.
    const x = Math.min(e.clientX, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING)
    const y = Math.min(e.clientY, window.innerHeight - MENU_HEIGHT - VIEWPORT_PADDING)
    setMenu({ task, x, y })
  }

  async function handleDelete(task) {
    setMenu(null)
    try {
      await deleteTask(task.id)
      addToast('Task deleted · Cmd+Z to undo', 'success')
    } catch (err) {
      addToast(`Could not delete task: ${err.message}`, 'error')
    }
  }

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

  // Task mode: one group per priority, each sorted by how soon it is due.
  const byPriority = useMemo(() => {
    const groups = PRIORITY_ORDER.map((p) => ({
      priority: p,
      items: active.filter((t) => t.priority === p).sort(byDueDate),
    }))
    const known = new Set(PRIORITY_ORDER)
    const rest = active.filter((t) => !known.has(t.priority)).sort(byDueDate)
    if (rest.length) groups.push({ priority: 'Unset', items: rest })
    return groups.filter((g) => g.items.length > 0)
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

  const showingMatrix = mode === 'matrix'

  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 gap-3 overflow-hidden">
      <div className="flex items-center gap-3 flex-shrink-0">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-notion-text)' }}>
          {showingMatrix ? 'Eisenhower Matrix' : 'Tasks by priority'}
        </h2>
        <span className="text-xs" style={{ color: 'var(--color-notion-muted)' }}>
          {active.length} active {active.length === 1 ? 'task' : 'tasks'}
          {showingMatrix ? ' · drag a card into a quadrant to reclassify' : ' · highest priority first, then soonest due'}
        </span>
        <div className="ml-auto">
          <ModeSwitch mode={mode} onChange={setMode} />
        </div>
      </div>

      {/* Both panes stay mounted and cross-fade, so the switch animates the same
          going either way and neither view has to remount its scroll position. */}
      <div className="relative flex-1 min-h-0">
        <div
          aria-hidden={!showingMatrix}
          className={[
            'absolute inset-0 grid grid-cols-2 grid-rows-2 gap-3',
            'transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none',
            showingMatrix
              ? 'opacity-100 translate-x-0 scale-100 pointer-events-auto'
              : 'opacity-0 -translate-x-4 scale-[0.985] pointer-events-none',
          ].join(' ')}
        >
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
                        onContextMenu={openMenu}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div
          aria-hidden={showingMatrix}
          className={[
            'absolute inset-0 overflow-y-auto rounded-lg border',
            'transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none',
            showingMatrix
              ? 'opacity-0 translate-x-4 scale-[0.985] pointer-events-none'
              : 'opacity-100 translate-x-0 scale-100 pointer-events-auto',
          ].join(' ')}
          style={{ borderColor: 'var(--color-notion-border)' }}
        >
          {byPriority.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12px] italic" style={{ color: 'var(--color-notion-muted)' }}>
              No active tasks
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-4">
              {byPriority.map((group) => (
                <div key={group.priority} className="flex flex-col gap-1.5">
                  <div
                    className="flex items-center gap-2 sticky top-0 py-1 z-10"
                    style={{ background: 'var(--color-notion-bg)' }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: PRIORITY_COLOR[group.priority] || 'var(--color-notion-muted)' }}
                    />
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-notion-text)' }}>
                      {group.priority}
                    </span>
                    <span
                      className="text-xs tabular-nums px-1.5 rounded"
                      style={{ color: 'var(--color-notion-muted)', background: 'var(--color-notion-hover)' }}
                    >
                      {group.items.length}
                    </span>
                  </div>
                  {group.items.map((t) => (
                    <TaskRow key={t.id} task={t} onContextMenu={openMenu} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {menu && (
        <div
          className="fixed z-50 min-w-40 rounded-lg border border-notion-border bg-notion-surface shadow-2xl overflow-hidden"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-notion-hover transition-colors"
            onClick={() => handleDelete(menu.task)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
