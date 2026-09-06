import { useState } from 'react'
import { useTasks } from '../hooks/useTasks'
import { useFocusTask } from '../hooks/useFocusTask'
import { explain } from '../utils/focusScore'
import { Spinner } from '../components/shared/Spinner'

// One task. Nothing else on screen.
//
// The entire point is that a list of twenty produces paralysis, so this page never
// renders a list — not collapsed, not behind a toggle. Once a task is locked for the day
// even the "next candidate" control disappears, because a visible alternative is still a
// decision.

export default function FocusPage() {
  const { tasks, loading, updateTask, createTask, reload } = useTasks()
  const { proposal, locked, loadingLock, lock, unlock, skip, resetSkips, exhausted } = useFocusTask(tasks)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  if (loading || loadingLock) {
    return <div className="flex-1 flex items-center justify-center"><Spinner size="lg" /></div>
  }

  async function quickAdd(e) {
    e.preventDefault()
    const title = draft.trim()
    if (!title) return
    const created = await createTask({ title, priority: 'High', status: 'Not Started' })
    setDraft(''); setAdding(false)
    if (created?.id) await lock(created.id)
    reload()
  }

  async function complete() {
    await updateTask(proposal.task.id, { status: 'Done' })
    await unlock()
    resetSkips()
    reload()
  }

  const t = proposal?.task

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        {!t && !exhausted && (
          <div className="text-center">
            <p className="text-[15px] mb-6" style={{ color: 'var(--color-notion-muted)' }}>
              Nothing open. That is allowed.
            </p>
          </div>
        )}

        {exhausted && (
          <div className="text-center">
            <p className="text-[15px] mb-4" style={{ color: 'var(--color-notion-muted)' }}>
              You passed on everything.
            </p>
            <button onClick={resetSkips} className="text-[13px] underline"
              style={{ color: 'var(--color-notion-muted)' }}>Start over</button>
          </div>
        )}

        {t && (
          <>
            {locked && (
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-5 text-center"
                style={{ color: 'var(--color-notion-placeholder)' }}>
                Today
              </div>
            )}

            <h1 className="text-[28px] leading-[1.25] font-semibold tracking-tight text-center mb-4">
              {t.title}
            </h1>

            <div className="text-[12.5px] text-center mb-10" style={{ color: 'var(--color-notion-muted)' }}>
              {t.estimated_mins ? `${t.estimated_mins} min` : null}
              {t.estimated_mins ? ' · ' : ''}
              {explain(proposal)}
            </div>

            {locked ? (
              <div className="flex flex-col items-center gap-4">
                <button onClick={complete}
                  className="px-7 py-2.5 rounded-full text-[14px] font-medium text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--color-notion-text)' }}>
                  Done
                </button>
                <button onClick={unlock} className="text-[12px] transition-opacity hover:opacity-70"
                  style={{ color: 'var(--color-notion-placeholder)' }}>
                  pick something else
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <button onClick={() => lock(t.id)}
                  className="px-7 py-2.5 rounded-full text-[14px] font-medium text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--color-notion-text)' }}>
                  This is it
                </button>
                <button onClick={() => skip(t.id)} className="text-[12px] transition-opacity hover:opacity-70"
                  style={{ color: 'var(--color-notion-placeholder)' }}>
                  not this one
                </button>
              </div>
            )}
          </>
        )}

        {!locked && (
          <div className="mt-12 text-center">
            {adding ? (
              <form onSubmit={quickAdd}>
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => !draft && setAdding(false)}
                  placeholder="what actually matters right now"
                  className="w-full text-center text-[14px] bg-transparent outline-none pb-1"
                  style={{ borderBottom: '1px solid var(--color-notion-border)' }} />
              </form>
            ) : (
              <button onClick={() => setAdding(true)} className="text-[12px] transition-opacity hover:opacity-70"
                style={{ color: 'var(--color-notion-placeholder)' }}>
                something else entirely
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
