# Workspace Page Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the workspace page into smaller hooks and section components with lower state leakage while preserving behavior and allowing small UX cleanups.

**Architecture:** Extract pure workspace derivation into a tested helper module, move page-specific orchestration into focused hooks, and replace the monolithic page render tree with small workspace section components. Keep route-level dependencies in `WorkspacePage.jsx` and avoid introducing a global store.

**Tech Stack:** React 19, Vite, ESLint, Node test runner

---

### Task 1: Lock behavior with helper tests

**Files:**
- Create: `frontend/src/hooks/workspace/workspaceModels.js`
- Create: `frontend/src/hooks/workspace/workspaceModels.test.js`
- Modify: `frontend/package.json`

- [ ] Write failing tests for active-task selection, task counts, filter/sort behavior, and sprint breakdown parsing.
- [ ] Run `node --test frontend/src/hooks/workspace/workspaceModels.test.js` and confirm the missing-module failure.
- [ ] Implement the helper module with the smallest pure functions needed to satisfy the tests.
- [ ] Re-run `node --test frontend/src/hooks/workspace/workspaceModels.test.js` and confirm the helper behavior passes.

### Task 2: Extract workspace orchestration hooks

**Files:**
- Create: `frontend/src/hooks/workspace/useWorkspaceTaskBoard.js`
- Create: `frontend/src/hooks/workspace/useWorkspaceSprintController.js`
- Create: `frontend/src/hooks/workspace/useWorkspaceOrganizePanel.js`
- Create: `frontend/src/hooks/workspace/useWorkspaceRecoveryActions.js`
- Create: `frontend/src/hooks/workspace/useWorkspacePaneResize.js`
- Modify: `frontend/src/pages/WorkspacePage.jsx`

- [ ] Move task-list state and handlers into `useWorkspaceTaskBoard.js`.
- [ ] Move active-task and sprint orchestration into `useWorkspaceSprintController.js`.
- [ ] Move organize-panel state and submit behavior into `useWorkspaceOrganizePanel.js`.
- [ ] Move recovery side-effect wrappers into `useWorkspaceRecoveryActions.js`.
- [ ] Move divider drag handling into `useWorkspacePaneResize.js`.

### Task 3: Split the page into focused UI sections

**Files:**
- Create: `frontend/src/components/workspace/WorkspaceToolbar.jsx`
- Create: `frontend/src/components/workspace/WorkspaceOrganizePanel.jsx`
- Create: `frontend/src/components/workspace/WorkspaceTaskList.jsx`
- Create: `frontend/src/components/workspace/WorkspaceFocusPanel.jsx`
- Modify: `frontend/src/pages/WorkspacePage.jsx`

- [ ] Extract the task-list toolbar into `WorkspaceToolbar.jsx`.
- [ ] Extract the organize panel into `WorkspaceOrganizePanel.jsx`.
- [ ] Extract the left-pane task-list rendering into `WorkspaceTaskList.jsx`.
- [ ] Extract the timer, active-task card, and sprint-goal UI into `WorkspaceFocusPanel.jsx`.
- [ ] Reduce `WorkspacePage.jsx` to hook composition, recovery-card placement, and modal wiring.

### Task 4: Verify the refactor

**Files:**
- Modify: `frontend/src/pages/WorkspacePage.jsx`
- Modify: `frontend/src/components/workspace/WorkspaceTaskList.jsx`
- Modify: `frontend/src/components/workspace/WorkspaceFocusPanel.jsx`

- [ ] Run `node --test frontend/src/hooks/workspace/workspaceModels.test.js`.
- [ ] Run `npm run build` in `frontend/`.
- [ ] Run `npm run lint` in `frontend/`.
- [ ] Fix any refactor-introduced failures and document any remaining pre-existing lint issues that were not part of this change.
