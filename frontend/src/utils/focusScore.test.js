import { describe, it, expect } from 'vitest'
import { scoreTask, rankTasks, taskTags } from './focusScore'

// Fixed "now" so due-date arithmetic is deterministic.
const NOW = new Date('2026-10-02T15:00:00Z').getTime()
const task = (over = {}) => ({
  id: 'x', title: 't', status: 'Not Started', priority: 'Medium',
  estimated_mins: 30, created_at: '2026-10-01T00:00:00Z', tags: [], ...over,
})

describe('taskTags', () => {
  it('reads an array', () => {
    expect(taskTags(task({ tags: ['Quant', 'priority'] }))).toEqual(['quant', 'priority'])
  })
  it('reads a JSON string', () => {
    expect(taskTags(task({ tags: '["quant","priority"]' }))).toEqual(['quant', 'priority'])
  })
  it('reads a legacy bare comma string', () => {
    expect(taskTags(task({ tags: 'research,ai,career' }))).toEqual(['research', 'ai', 'career'])
  })
  it('survives null, empty and malformed input', () => {
    expect(taskTags(task({ tags: null }))).toEqual([])
    expect(taskTags(task({ tags: '' }))).toEqual([])
    expect(taskTags(task({ tags: '[not json' }))).toEqual(['[not json'])
    expect(taskTags(undefined)).toEqual([])
  })
})

describe('standing priority', () => {
  it('adds the bonus and says why', () => {
    const plain = scoreTask(task(), NOW)
    const flagged = scoreTask(task({ tags: ['priority'] }), NOW)
    expect(flagged.score - plain.score).toBe(30)
    expect(flagged.reasons).toContain('standing priority')
  })

  it('does not fire for other tags', () => {
    expect(scoreTask(task({ tags: ['quant'] }), NOW).reasons).not.toContain('standing priority')
  })

  // The calibration that matters: it must lift quant over idle chores WITHOUT
  // outranking something actually due today.
  it('loses to a task due today', () => {
    const dueToday = scoreTask(task({ due_date: '2026-10-02', priority: 'High', urgent: 1, important: 1 }), NOW)
    const standing = scoreTask(task({ tags: ['priority'], priority: 'High', urgent: 1, important: 1 }), NOW)
    expect(dueToday.score).toBeGreaterThan(standing.score)
  })

  it('beats an undated Medium chore', () => {
    const chore = scoreTask(task({ priority: 'Medium' }), NOW)
    const standing = scoreTask(task({ tags: ['priority'], priority: 'High', important: 1 }), NOW)
    expect(standing.score).toBeGreaterThan(chore.score)
  })

  it('ranks quant above a week-out assignment, below tonight’s problem set', () => {
    const ranked = rankTasks([
      { ...task({ id: 'ps2', title: 'CMSC422 PS2', due_date: '2026-10-02', priority: 'High', urgent: 1, important: 1, estimated_mins: 240 }) },
      { ...task({ id: 'quant', title: 'Quant mocks', tags: ['quant', 'priority'], priority: 'High', urgent: 1, important: 1, estimated_mins: 90 }) },
      { ...task({ id: 'hw2', title: 'CMSC421 HW2', due_date: '2026-10-09', priority: 'Medium', important: 1, estimated_mins: 120 }) },
    ], NOW)
    expect(ranked.map((r) => r.task.id)).toEqual(['ps2', 'quant', 'hw2'])
  })
})
