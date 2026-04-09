import { PRIORITY_ORDER } from '../../constants/todoBoardConstants.js'

function compareByPriority(a, b) {
  return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
}

function compareByPosition(a, b) {
  return (a.position ?? 0) - (b.position ?? 0)
}

export function getActiveTask(tasks) {
  const inProgress = tasks.find(task => task.status === 'In Progress')
  if (inProgress) return inProgress

  return tasks
    .filter(task => task.status === 'Not Started')
    .sort((a, b) => {
      const priorityDifference = compareByPriority(a, b)
      return priorityDifference !== 0 ? priorityDifference : compareByPosition(a, b)
    })[0] ?? null
}

export function getWorkspaceTaskCounts(tasks) {
  return {
    active: tasks.filter(task => task.status !== 'Done').length,
    done: tasks.filter(task => task.status === 'Done').length,
    all: tasks.length,
  }
}

export function getFilteredTasks(tasks, {
  filterStatus = 'active',
  sortBy = 'priority',
} = {}) {
  return tasks
    .filter(task => {
      if (filterStatus === 'active') return task.status !== 'Done'
      if (filterStatus === 'done') return task.status === 'Done'
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'priority') return compareByPriority(a, b)
      if (sortBy === 'duration') return (a.estimated_mins ?? 0) - (b.estimated_mins ?? 0)
      return compareByPosition(a, b)
    })
}

export function getSprintState(activeTask) {
  try {
    return {
      currentSprintGoal: activeTask?.current_sprint_goal ?? '',
      currentSubtaskIndex: activeTask?.current_subtask_index ?? 0,
      breakdownSteps: activeTask?.breakdown_json ? JSON.parse(activeTask.breakdown_json) : [],
    }
  } catch {
    return {
      currentSprintGoal: activeTask?.current_sprint_goal ?? '',
      currentSubtaskIndex: activeTask?.current_subtask_index ?? 0,
      breakdownSteps: [],
    }
  }
}
