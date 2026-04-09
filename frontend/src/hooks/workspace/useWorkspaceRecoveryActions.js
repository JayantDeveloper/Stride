import { useCallback } from 'react'

export function useWorkspaceRecoveryActions({
  recovery,
  reloadTasks,
  reloadEvents,
  addToast,
  requestTimerStart,
}) {
  const refreshWorkspace = useCallback(() => {
    void reloadTasks()
    void reloadEvents?.()
  }, [reloadTasks, reloadEvents])

  const handleRecoveryStartSprint = useCallback(async () => {
    try {
      const data = await recovery.startSprintNow()
      const taskId = data?.task?.id ?? recovery.block?.task_id
      if (!taskId) return

      requestTimerStart({ taskId, plannedMins: 10 })
      refreshWorkspace()
      addToast('Starting a 10-minute sprint', 'success')
    } catch (error) {
      addToast(error.message || 'Failed to start sprint', 'error')
      await recovery.reload()
    }
  }, [addToast, recovery, refreshWorkspace, requestTimerStart])

  const handleRecoveryMove = useCallback(async () => {
    try {
      await recovery.moveToNextOpenSlot()
      refreshWorkspace()
      addToast('Moved to the next open slot', 'success')
    } catch (error) {
      addToast(error.message || 'Failed to move block', 'error')
      await recovery.reload()
    }
  }, [addToast, recovery, refreshWorkspace])

  const handleRecoveryDefer = useCallback(async () => {
    try {
      await recovery.deferToTomorrow()
      refreshWorkspace()
      addToast('Deferred to tomorrow', 'success')
    } catch (error) {
      addToast(error.message || 'Failed to defer block', 'error')
      await recovery.reload()
    }
  }, [addToast, recovery, refreshWorkspace])

  const handleRecoveryDismiss = useCallback(async () => {
    try {
      await recovery.dismiss()
      addToast('Recovery card dismissed for now', 'info')
    } catch (error) {
      addToast(error.message || 'Failed to dismiss recovery card', 'error')
    }
  }, [addToast, recovery])

  return {
    block: recovery.block,
    recommendation: recovery.recommendation,
    aiLoading: recovery.aiLoading,
    actionLoading: recovery.actionLoading,
    handleRecoveryStartSprint,
    handleRecoveryMove,
    handleRecoveryDefer,
    handleRecoveryDismiss,
  }
}
