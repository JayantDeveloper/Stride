import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getActiveTask,
  getWorkspaceTaskCounts,
  getFilteredTasks,
  getSprintState,
} from './workspaceModels.js'

test('getActiveTask prefers the in-progress task', () => {
  const tasks = [
    { id: 1, title: 'Low', status: 'Not Started', priority: 'Low', position: 2 },
    { id: 2, title: 'Doing', status: 'In Progress', priority: 'Medium', position: 3 },
    { id: 3, title: 'High', status: 'Not Started', priority: 'High', position: 1 },
  ]

  assert.equal(getActiveTask(tasks)?.id, 2)
})

test('getActiveTask falls back to the highest-priority not-started task', () => {
  const tasks = [
    { id: 1, title: 'Medium later', status: 'Not Started', priority: 'Medium', position: 2 },
    { id: 2, title: 'Low', status: 'Not Started', priority: 'Low', position: 1 },
    { id: 3, title: 'High', status: 'Not Started', priority: 'High', position: 4 },
  ]

  assert.equal(getActiveTask(tasks)?.id, 3)
})

test('getWorkspaceTaskCounts reports active, done, and all totals', () => {
  const tasks = [
    { id: 1, status: 'Not Started' },
    { id: 2, status: 'In Progress' },
    { id: 3, status: 'Done' },
  ]

  assert.deepEqual(getWorkspaceTaskCounts(tasks), {
    active: 2,
    done: 1,
    all: 3,
  })
})

test('getFilteredTasks keeps inline-edit tasks in the normal list, applies active filter, and sorts by priority', () => {
  const tasks = [
    { id: 1, title: 'Done', status: 'Done', priority: 'High', position: 1, estimated_mins: 30 },
    { id: 2, title: 'Inline', status: 'Not Started', priority: 'High', position: 2, estimated_mins: 15 },
    { id: 3, title: 'Medium', status: 'Not Started', priority: 'Medium', position: 3, estimated_mins: 10 },
    { id: 4, title: 'High', status: 'Not Started', priority: 'High', position: 4, estimated_mins: 60 },
  ]

  const filtered = getFilteredTasks(tasks, {
    filterStatus: 'active',
    sortBy: 'priority',
  })

  assert.deepEqual(filtered.map(task => task.id), [2, 4, 3])
})

test('getFilteredTasks sorts by duration when requested', () => {
  const tasks = [
    { id: 1, status: 'Not Started', priority: 'Medium', position: 2, estimated_mins: 60 },
    { id: 2, status: 'Not Started', priority: 'High', position: 1, estimated_mins: 15 },
    { id: 3, status: 'Not Started', priority: 'Low', position: 3, estimated_mins: 30 },
  ]

  const filtered = getFilteredTasks(tasks, {
    filterStatus: 'all',
    sortBy: 'duration',
  })

  assert.deepEqual(filtered.map(task => task.id), [2, 3, 1])
})

test('getSprintState parses saved breakdown state from the active task', () => {
  const sprintState = getSprintState({
    current_sprint_goal: 'Write tests',
    current_subtask_index: 1,
    breakdown_json: '["Set up tests","Write tests","Refactor"]',
  })

  assert.deepEqual(sprintState, {
    currentSprintGoal: 'Write tests',
    currentSubtaskIndex: 1,
    breakdownSteps: ['Set up tests', 'Write tests', 'Refactor'],
  })
})

test('getSprintState tolerates invalid breakdown json', () => {
  const sprintState = getSprintState({
    current_sprint_goal: '',
    current_subtask_index: 0,
    breakdown_json: '{bad json',
  })

  assert.deepEqual(sprintState, {
    currentSprintGoal: '',
    currentSubtaskIndex: 0,
    breakdownSteps: [],
  })
})
