import { Button } from '../shared/Button'
import { Spinner } from '../shared/Spinner'
import { InlineTaskRow } from '../tasks/InlineTaskRow'
import { TaskListHeader, TaskRow } from '../tasks/TaskRow'

export function WorkspaceTaskList({
  loading,
  filterStatus,
  filteredTasks,
  newTaskRows,
  draggedId,
  activeTaskId,
  activeRowHighlight,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onFieldSave,
  onNewTaskSave,
  onNewTaskDone,
  onTaskDragStart,
  onTaskDrop,
  onTaskDragEnd,
}) {
  return (
    <>
      <TaskListHeader />

      {newTaskRows.map(task => (
        <InlineTaskRow
          key={task.id}
          task={task}
          onSave={fields => onNewTaskSave(task.id, fields)}
          onCancel={() => onNewTaskDone(task.id)}
        />
      ))}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : filteredTasks.length === 0 && newTaskRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-notion-muted">
            <p className="text-2xl mb-2 opacity-30">✓</p>
            <p className="text-sm">
              {filterStatus === 'active' ? 'All caught up.' : 'No tasks here.'}
            </p>
            {filterStatus === 'active' && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={onAddTask}>
                Add a task
              </Button>
            )}
          </div>
        ) : (
          <div>
            {filteredTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                isDragging={draggedId === task.id}
                highlight={task.id === activeTaskId ? activeRowHighlight : null}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                onFieldSave={onFieldSave}
                onDragStart={() => onTaskDragStart(task.id)}
                onDragOver={() => {}}
                onDrop={() => { void onTaskDrop(task.id) }}
                onDragEnd={onTaskDragEnd}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
