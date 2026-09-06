// Ranking for the Focus tab: which single task to propose next.
//
// Deliberately simple and explainable, because the tab prints its reason under the task.
// A score you cannot explain in one line is a score you will not trust, and an untrusted
// proposal is worse than no proposal — you cannot scan past it the way you can a list.
//
// Calibrated against the real backlog (Sept 2026), where only 2 of 20 open tasks had a
// due date and only 2 were flagged urgent. Anything leaning hard on deadlines would have
// had almost nothing to work with, so the weights lean on importance and staleness.
//
// Staleness is the closest available proxy for "the one I am avoiding" — there is no
// dread field. But staleness ALONE ranks a 106-day-old Low-priority side project first,
// so it is gated behind importance rather than used on its own.

const PRIORITY_WEIGHT = { High: 3, Medium: 2, Low: 1 }

export function scoreTask(task, now = Date.now()) {
  const reasons = []
  let score = 0

  // Deadlines. Upcoming ones dominate; PAST ones decay.
  //
  // A flat overdue bonus was wrong here: the only two overdue tasks in the real backlog
  // were 28 and 47 days past due, both Medium/20min/not-important, and a flat +100 let
  // them outrank "Apply to 5+ internships" (urgent + important + High). A deadline missed
  // yesterday is a live signal; one missed seven weeks ago is a stale field the world
  // already moved past. So the bonus decays to a floor over 30 days.
  if (task.due_date) {
    // Compare CALENDAR DAYS, not timestamps. A date-only due_date parses to midnight, so
    // by any time in the afternoon a task due today looked negative and read as "overdue".
    const dayOf = (d) => { const x = new Date(d); return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) }
    const days = Math.round((dayOf(task.due_date + 'T12:00:00') - dayOf(new Date(now))) / 86400000)
    if (days === 0) { score += 100; reasons.push('due TODAY') }
    else if (days < 0) {
      const overdueBy = -days
      const freshness = Math.max(0, 1 - overdueBy / 30)
      score += 20 + 80 * freshness
      reasons.push(overdueBy <= 1 ? 'overdue' : `${overdueBy}d overdue`)
    } else if (days <= 2) { score += 60; reasons.push(`due in ${days}d`) }
    else if (days <= 7) { score += 25; reasons.push(`due in ${days}d`) }
  }

  if (task.urgent) { score += 20; reasons.push('urgent') }
  if (task.important) { score += 25; reasons.push('important') }

  score += (PRIORITY_WEIGHT[task.priority] ?? 2) * 6
  if (task.priority === 'High') reasons.push('high priority')

  // Already started beats not started: finishing something half-done is usually higher
  // leverage than opening a new front, and it is the cheaper win.
  if (task.status === 'In Progress') { score += 15; reasons.push('already started') }

  // Staleness, gated. Only counts for important or high-priority tasks, so an ancient
  // low-stakes item cannot float to the top on age alone.
  const ageDays = task.created_at
    ? Math.floor((now - new Date(task.created_at)) / 86400000)
    : 0
  const worthNagging = task.important || task.priority === 'High'
  if (worthNagging && ageDays >= 30) {
    score += Math.min(ageDays / 4, 25)
    reasons.push(`${ageDays}d untouched`)
  }

  // Nudge toward things that fit in one sitting — a 300-minute task is a poor answer to
  // "what should I start right now".
  const mins = task.estimated_mins ?? 30
  if (mins <= 60) score += 5
  else if (mins >= 180) { score -= 8; reasons.push('big — consider splitting') }

  return { score, reasons, ageDays }
}

export function rankTasks(tasks, now = Date.now()) {
  return tasks
    .filter((t) => t.status !== 'Done')
    .map((t) => ({ task: t, ...scoreTask(t, now) }))
    .sort((a, b) => b.score - a.score || String(a.task.id).localeCompare(String(b.task.id)))
}

export function explain(entry) {
  if (!entry) return ''
  const top = entry.reasons.filter((r) => !r.startsWith('big')).slice(0, 3)
  return top.length ? top.join(' · ') : 'next in your list'
}
