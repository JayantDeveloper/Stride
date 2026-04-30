import { CheckInModal } from "../components/execute/CheckInModal";
import { WorkspaceFocusPanel } from "../components/workspace/WorkspaceFocusPanel";
import { WorkspaceOrganizePanel } from "../components/workspace/WorkspaceOrganizePanel";
import { WorkspaceTaskList } from "../components/workspace/WorkspaceTaskList";
import { WorkspaceToolbar } from "../components/workspace/WorkspaceToolbar";
import { TaskModal } from "../components/tasks/TaskModal";
import { useTasks } from "../hooks/useTasks";
import { useWorkspaceOrganizePanel } from "../hooks/workspace/useWorkspaceOrganizePanel";
import { useWorkspacePaneResize } from "../hooks/workspace/useWorkspacePaneResize";
import { useWorkspaceSprintController } from "../hooks/workspace/useWorkspaceSprintController";
import { useWorkspaceTaskBoard } from "../hooks/workspace/useWorkspaceTaskBoard";
import { useOrganize } from "../hooks/useAIOrganize";
import { useTaskActivationAI } from "../hooks/useTaskActivationAI";
import { useCalendarEvents } from "../hooks/useCalendarEvents";
import { useToast } from "../context/ToastContext";

export default function WorkspacePage({
  externalSprintRequest,
  onExternalSprintHandled,
}) {
  const {
    tasks,
    loading,
    createTask,
    updateTask,
    deleteTask,
    undoDelete,
    reorderTasks,
    reload,
  } = useTasks();
  const { reload: reloadEvents } = useCalendarEvents({ skip: true });
  const { loadingAction: activationLoadingAction, getBreakdown } =
    useTaskActivationAI();
  const { organize, loading: organizing } = useOrganize({
    onComplete: () => reloadEvents(),
  });
  const { addToast } = useToast();

  const taskBoard = useWorkspaceTaskBoard({
    tasks,
    loading,
    createTask,
    updateTask,
    deleteTask,
    undoDelete,
    reorderTasks,
    reloadEvents,
    addToast,
  });

  const sprint = useWorkspaceSprintController({
    tasks,
    updateTask,
    reloadTasks: reload,
    getBreakdown,
    addToast,
    externalSprintRequest,
    onExternalSprintHandled,
  });

  const organizePanel = useWorkspaceOrganizePanel({
    organize,
    organizing,
    addToast,
  });

  const { containerRef, rightPct, handleDividerMouseDown } =
    useWorkspacePaneResize();

  return (
    <div
      ref={containerRef}
      className="flex flex-1 min-h-0 h-full overflow-hidden"
    >
      <div
        className="flex flex-col min-h-0 overflow-hidden"
        style={{ flex: "1 1 0", minWidth: 0 }}
      >
        <WorkspaceToolbar
          filterStatus={taskBoard.filterStatus}
          sortBy={taskBoard.sortBy}
          counts={taskBoard.counts}
          showOrganize={organizePanel.showOrganize}
          onFilterStatusChange={taskBoard.setFilterStatus}
          onSortByChange={taskBoard.setSortBy}
          onToggleOrganize={organizePanel.toggleOrganize}
          onAddTask={() => {
            void taskBoard.handleAddTask();
          }}
        />

        {organizePanel.showOrganize && (
          <WorkspaceOrganizePanel
            organizeFromNow={organizePanel.organizeFromNow}
            organizeDate={organizePanel.organizeDate}
            organizing={organizePanel.organizing}
            onModeChange={organizePanel.setOrganizeMode}
            onDateChange={organizePanel.setOrganizeDate}
            onCancel={organizePanel.closeOrganize}
            onSubmit={() => {
              void organizePanel.handleOrganize();
            }}
          />
        )}

        <WorkspaceTaskList
          loading={taskBoard.loading}
          filterStatus={taskBoard.filterStatus}
          filteredTasks={taskBoard.filteredTasks}
          editingTaskIds={taskBoard.editingTaskIds}
          draggedId={taskBoard.draggedId}
          activeTaskId={sprint.activeTask?.id ?? null}
          activeRowHighlight={sprint.activeRowHighlight}
          onAddTask={() => {
            void taskBoard.handleAddTask();
          }}
          onEditTask={taskBoard.openTaskModal}
          onDeleteTask={taskBoard.handleDeleteTask}
          onFieldSave={taskBoard.handleFieldSave}
          onNewTaskSave={taskBoard.handleNewTaskSave}
          onNewTaskDone={taskBoard.handleNewTaskDone}
          onTaskDragStart={taskBoard.handleTaskDragStart}
          onTaskDrop={taskBoard.handleTaskDrop}
          onTaskDragEnd={taskBoard.handleTaskDragEnd}
        />
      </div>

      <div
        onMouseDown={handleDividerMouseDown}
        className="flex-shrink-0 flex items-center justify-center group"
        style={{
          width: 6,
          cursor: "col-resize",
          background: "var(--color-notion-border)",
          flexShrink: 0,
        }}
      >
        <div
          className="w-0.5 h-8 rounded-full opacity-0 group-hover:opacity-60 transition-opacity"
          style={{ background: "#818CF8" }}
        />
      </div>

      <WorkspaceFocusPanel
        rightPct={rightPct}
        activeTask={sprint.activeTask}
        pomodoroMode={sprint.pomodoroMode}
        timerStartRequest={sprint.timerStartRequest}
        activationLoadingAction={activationLoadingAction}
        breakdownSteps={sprint.breakdownSteps}
        currentSubtaskIndex={sprint.currentSubtaskIndex}
        currentSprintGoal={sprint.currentSprintGoal}
        onPomodoroModeChange={sprint.setPomodoroMode}
        onBeforeFocusStart={sprint.handleBeforeFocusStart}
        onTimerStartHandled={sprint.handleTimerStartHandled}
        onSessionComplete={sprint.handleSessionComplete}
        onBreakdown={sprint.handleBreakdown}
        onPreviousSprintGoal={sprint.handlePreviousSprintGoal}
        onNextSprintGoal={sprint.handleNextSprintGoal}
        onCompleteTask={sprint.handleCompleteTask}
      />

      <TaskModal
        key={
          taskBoard.taskModalOpen
            ? `task-${taskBoard.editingTask?.id ?? "new"}`
            : "closed"
        }
        isOpen={taskBoard.taskModalOpen}
        onClose={taskBoard.closeTaskModal}
        onSave={taskBoard.handleModalSave}
        task={taskBoard.editingTask}
      />

      <CheckInModal
        isOpen={!!sprint.checkinState}
        onClose={sprint.closeCheckin}
        taskId={sprint.checkinState?.taskId}
        taskTitle={sprint.checkinState?.taskTitle}
        sessionId={sprint.checkinState?.sessionId}
        onOutcomeSubmitted={sprint.handleCheckinOutcomeSubmitted}
        onReschedule={(taskId) => taskBoard.openTaskModal(tasks.find(t => t.id === taskId) ?? null)}
      />
    </div>
  );
}
