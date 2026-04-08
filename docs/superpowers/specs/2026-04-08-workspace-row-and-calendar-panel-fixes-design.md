# Workspace Row And Calendar Panel Fixes

Date: 2026-04-08
Status: Approved for planning

## Summary

This change fixes three related task-creation and scheduling UX issues in the workspace:

- a newly created task must appear immediately as a real table row in the normal list layout
- the Push to Calendar panel must provide an explicit cancel/close action
- new tasks must default the `Cal` column to `Split`

These are behavior and interaction fixes only. They do not change the scheduling algorithm itself.

## Goals

- Remove the visual glitch where a newly created task appears outside the normal table flow until focus leaves the row.
- Preserve the existing behavior that `+ Task` creates a real persisted task immediately.
- Make canceling inline edit stop editing without deleting the new task.
- Let users dismiss the Push to Calendar panel without scheduling anything.
- Default newly created tasks to split scheduling in both backend defaults and first-render UI state.

## Non-Goals

- Reworking the task table layout.
- Changing how task creation is persisted.
- Changing scheduling logic beyond the default `allow_split` value.
- Redesigning the Push to Calendar panel.

## Current Problems

### New task row glitch

`WorkspacePage` creates the task immediately through `createTask()`, but newly created tasks are rendered through a separate `editingNewIds` block above the main filtered list.

That causes the new row to:
- appear at the top instead of in normal list order
- render outside the standard table row flow
- only become a normal row after inline editing ends

This makes the task look temporary even though it already exists in the database.

### Push to Calendar panel has no explicit cancel action

The panel can be hidden by re-clicking the toolbar button, but there is no close control inside the panel itself.

That makes the panel feel modal-like without providing an obvious cancel path.

### Split default is off for new tasks

New tasks currently default `allow_split` to false at creation time, which makes the `Cal` column render as `Solid`.

The requested default is `Split`.

## Design

### 1. Render new tasks in the normal list immediately

Keep the current persistence model:
- clicking `+ Task` immediately creates a real task row in the backend
- the returned task stays in the task list regardless of whether editing is canceled

Change the rendering model:
- keep `editingNewIds` only as edit-state tracking
- do not render new tasks in a separate block above the table
- in the main list mapping, render `InlineTaskRow` when a task id is currently being edited
- otherwise render the standard `TaskRow`

Result:
- the new task is positioned in the real list immediately
- the row uses the same table structure and alignment as other rows
- leaving edit mode only changes row presentation, not row existence

### 2. Canceling inline edit does not remove the task

For newly created rows:
- `Esc`, blur completion, or clicking the inline done control should only exit inline edit state
- the task remains persisted and visible in the list

No delete-on-cancel behavior will be added.

### 3. Add an explicit cancel control to Push to Calendar

Inside the Push to Calendar panel, add a secondary action next to `Push`:
- label: `Cancel` or `Close`
- behavior: hide the panel and abandon the pending push action
- no API request is sent

The existing toolbar toggle remains valid and does not need to be removed.

### 4. Default new tasks to Split

Set `allow_split = 1` by default for new tasks across the creation path.

Required locations:
- backend task creation default
- frontend new-task/edit defaults where new task state is initialized

Result:
- a newly created task shows `Split` in the `Cal` column immediately
- scheduling features inherit the intended default without requiring a manual toggle

## Implementation Notes

Expected touch points:
- `frontend/src/pages/WorkspacePage.jsx`
- `frontend/src/components/tasks/InlineTaskRow.jsx`
- `frontend/src/components/tasks/TaskModal.jsx`
- `frontend/src/hooks/useTasks.js`
- `backend/routes/tasks.js`
- possibly `backend/db/database.js` if the schema default should also be updated for consistency

Preferred implementation shape:
- keep changes local to the existing workspace/task creation flow
- do not introduce a second temporary task model
- avoid broad refactors in the task table component hierarchy

## Testing

### Manual checks

- click `+ Task` and verify the new task appears immediately as a normal in-table row
- confirm the new row is not rendered above the table body as a separate block
- press `Esc` while editing a newly created task and verify the row remains
- click outside the inline editor and verify the row remains and stays aligned
- open Push to Calendar and cancel from inside the panel
- confirm no scheduling occurs when canceling
- create a new task and verify the `Cal` column shows `Split`

### Regression checks

- inline save still persists title and other edited fields
- existing non-new rows still render through `TaskRow`
- Push to Calendar still schedules correctly when `Push` is clicked
- toggling `Split` and `Solid` in the `Cal` column still works after creation

## Acceptance Criteria

- `+ Task` creates a real task immediately and it appears in the normal table flow
- the newly created row no longer appears at the top in a misaligned standalone block
- canceling inline edit leaves the task in the list
- the Push to Calendar panel has an explicit cancel/close action
- canceling the panel does not trigger scheduling
- new tasks default to `Split` in the `Cal` column
