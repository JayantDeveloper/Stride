# Workspace Page Refactor Design

## Goal

Refactor the workspace surface so `frontend/src/pages/WorkspacePage.jsx` becomes a thin composition layer with cleaner boundaries between task-list orchestration, sprint orchestration, organize-panel state, recovery actions, and split-pane layout behavior.

The refactor should preserve existing behavior by default, while allowing small UX cleanups that naturally fall out of clearer ownership.

## Problems In The Current Shape

- `WorkspacePage.jsx` owns too many independent concerns.
- UI sections are coupled to unrelated state and side effects.
- Sprint state is synchronized through effects that mirror task fields into local state.
- Recovery, organize, and task-list actions all trigger their own reload and toast logic inline.
- The page is hard to read and hard to change safely because it mixes derivation, orchestration, and rendering.

## Design

### Page responsibilities

`WorkspacePage.jsx` will keep only route-level composition responsibilities:

- instantiate shared data hooks
- instantiate workspace-specific hooks
- render section components
- bridge route-level props such as `externalSprintRequest`

### Workspace hooks

Create focused workspace hooks under `frontend/src/hooks/workspace/`:

- `useWorkspaceTaskBoard.js`
  - owns filters, sort, drag state, inline-new-task state, modal state, filtered tasks, counts, and task mutation wrappers
- `useWorkspaceSprintController.js`
  - owns active-task derivation, sprint breakdown parsing, sprint-goal progression, task completion, timer start requests, and check-in state
- `useWorkspaceOrganizePanel.js`
  - owns organize panel visibility, date mode, and submit action
- `useWorkspaceRecoveryActions.js`
  - wraps missed-block recovery actions with the workspace-specific toast and reload side effects
- `useWorkspacePaneResize.js`
  - owns right-pane width state and divider drag handling

### Workspace components

Create focused components under `frontend/src/components/workspace/`:

- `WorkspaceToolbar.jsx`
- `WorkspaceOrganizePanel.jsx`
- `WorkspaceTaskList.jsx`
- `WorkspaceFocusPanel.jsx`

Each component should receive already-shaped props and avoid reaching into unrelated application concerns.

### Shared helpers

Move pure workspace derivation into `frontend/src/hooks/workspace/workspaceModels.js` so it can be tested directly:

- active-task selection
- task filtering and sorting
- task counts
- sprint breakdown parsing

## UX Adjustments Allowed In This Pass

- unify the left-pane empty and loading rendering path
- make toolbar ownership clearer by keeping task-list controls together
- keep organize-panel loading and submit state inside the panel boundary
- derive focus-panel button disabled states from sprint state instead of scattered inline checks
- keep recovery-card success and error behavior consistent across actions

## Non-Goals

- no backend API changes
- no task schema changes
- no calendar-page refactor in this pass
- no new global state store
- no broad visual redesign

## Verification

- add unit tests for the extracted pure workspace model helpers
- run the new helper tests
- run `npm run build`
- run `npm run lint` and report any remaining failures, distinguishing pre-existing issues from regressions
