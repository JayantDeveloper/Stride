import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import WorkspacePage from './WorkspacePage'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  organize: vi.fn(async () => ({ scheduled: [] })),
  reloadEvents: vi.fn(),
  startSprintNow: vi.fn(),
  nextTaskId: 2,
  serverTasks: [
    {
      id: 'task-1',
      title: 'Existing task',
      status: 'Not Started',
      priority: 'Medium',
      difficulty: 'Easy',
      estimated_mins: 30,
      allow_split: 1,
    },
  ],
}))

vi.mock('../utils/apiClient', () => ({
  apiRequest: async (url, options = {}) => {
    const method = String(options.method ?? 'GET').toUpperCase()
    const body = options.body ?? {}

    if (method === 'GET' && String(url).startsWith('/api/tasks')) {
      return { tasks: mocks.serverTasks }
    }

    if (method === 'POST' && url === '/api/tasks') {
      const task = {
        id: `task-${mocks.nextTaskId++}`,
        title: body.title ?? 'New task',
        status: body.status ?? 'Not Started',
        priority: body.priority ?? 'Medium',
        difficulty: body.difficulty ?? 'Easy',
        estimated_mins: body.estimated_mins ?? 30,
        allow_split: body.allow_split ?? 0,
        due_date: body.due_date ?? null,
        scheduled_date: body.scheduled_date ?? null,
        description: body.description ?? '',
        tags: body.tags ?? [],
      }
      mocks.serverTasks = [...mocks.serverTasks, task]
      return { task }
    }

    const taskMatch = String(url).match(/^\/api\/tasks\/([^/]+)$/)
    if (taskMatch && method === 'PATCH') {
      const taskId = taskMatch[1]
      const task = mocks.serverTasks.find(item => item.id === taskId)
      if (!task) throw new Error('Task not found')
      Object.assign(task, body)
      return { task }
    }

    if (taskMatch && method === 'DELETE') {
      const taskId = taskMatch[1]
      mocks.serverTasks = mocks.serverTasks.filter(item => item.id !== taskId)
      return { ok: true }
    }

    throw new Error(`Unhandled apiRequest mock: ${method} ${url}`)
  },
}))

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}))

vi.mock('../hooks/useAIOrganize', () => ({
  useOrganize: () => ({
    organize: mocks.organize,
    loading: false,
  }),
}))

vi.mock('../hooks/useCalendarEvents', () => ({
  useCalendarEvents: () => ({
    reload: mocks.reloadEvents,
  }),
}))

vi.mock('../hooks/useMissedBlockRecovery', () => ({
  useMissedBlockRecovery: () => ({
    block: null,
    aiLoading: false,
    actionLoading: false,
    recommendation: null,
    startSprintNow: mocks.startSprintNow,
    moveToNextOpenSlot: vi.fn(),
    deferToTomorrow: vi.fn(),
    dismiss: vi.fn(),
    reload: vi.fn(),
  }),
}))

vi.mock('../hooks/useTaskActivationAI', () => ({
  useTaskActivationAI: () => ({
    loadingAction: '',
    getBreakdown: vi.fn(),
  }),
}))

vi.mock('../components/tasks/TaskModal', () => ({
  TaskModal: () => null,
}))

vi.mock('../components/tasks/AddToCalendarModal', () => ({
  AddToCalendarModal: () => null,
}))

vi.mock('../components/execute/CheckInModal', () => ({
  CheckInModal: () => null,
}))

vi.mock('../components/execute/ExecutionPomodoro', () => ({
  ExecutionPomodoro: () => null,
}))

vi.mock('../components/shared/MissedBlockRecoveryCard', () => ({
  MissedBlockRecoveryCard: () => null,
}))

vi.mock('../components/shared/Spinner', () => ({
  Spinner: () => <div data-testid="spinner" />,
}))

describe('WorkspacePage regressions', () => {
  async function waitForInitialLoad() {
    await waitFor(() => {
      expect(screen.queryByTestId('spinner')).not.toBeInTheDocument()
    })
  }

  beforeEach(() => {
    mocks.nextTaskId = 2
    mocks.serverTasks = [
      {
        id: 'task-1',
        title: 'Existing task',
        status: 'Not Started',
        priority: 'Medium',
        difficulty: 'Easy',
        estimated_mins: 30,
        allow_split: 1,
      },
    ]
    mocks.addToast.mockReset()
    mocks.organize.mockClear()
    mocks.reloadEvents.mockClear()
    mocks.startSprintNow.mockClear()
  })

  it('new task renders inside the normal list and shows Split by default', async () => {
    const { container } = render(<WorkspacePage />)
    const listContainer = container.querySelector('div.flex-1.overflow-y-auto')

    await waitForInitialLoad()
    fireEvent.click(screen.getByRole('button', { name: '+ Task' }))

    const inlineRow = await screen.findByTestId('inline-task-row-task-2')
    const existingTask = within(listContainer).getByText('Existing task')
    const inlineTitleInput = within(inlineRow).getByDisplayValue('New task')

    expect(listContainer).toBeInTheDocument()
    expect(listContainer).toContainElement(inlineRow)
    expect(listContainer).toContainElement(existingTask)
    expect(existingTask.compareDocumentPosition(inlineTitleInput) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(inlineRow).toBeInTheDocument()
    expect(within(inlineRow).getByRole('button', { name: 'Split' })).toBeInTheDocument()
  })

  it('canceling inline edit keeps the task row in the list', async () => {
    const { container } = render(<WorkspacePage />)
    const listContainer = container.querySelector('div.flex-1.overflow-y-auto')

    await waitForInitialLoad()
    fireEvent.click(screen.getByRole('button', { name: '+ Task' }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('New task')).toBeInTheDocument()
    })

    expect(listContainer).toBeInTheDocument()
    expect(screen.getByPlaceholderText('New task')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByPlaceholderText('New task'), { key: 'Escape' })

    await waitFor(() => {
      expect(within(listContainer).getByText('New task')).toBeInTheDocument()
    })
  })

  it('saving an inline task keeps the edited Cal mode on the persisted row', async () => {
    render(<WorkspacePage />)

    await waitForInitialLoad()
    fireEvent.click(screen.getByRole('button', { name: '+ Task' }))

    const inlineRow = await screen.findByTestId('inline-task-row-task-2')
    const titleInput = within(inlineRow).getByDisplayValue('New task')

    fireEvent.click(within(inlineRow).getByRole('button', { name: 'Split' }))
    expect(within(inlineRow).getByRole('button', { name: 'Solid' })).toBeInTheDocument()

    fireEvent.keyDown(titleInput, { key: 'Enter' })

    const savedRow = await screen.findByTestId('task-row-task-2')
    expect(within(savedRow).getByRole('button', { name: 'Solid' })).toBeInTheDocument()
  })

  it('undo delete preserves a Solid task instead of recreating it as Split', async () => {
    mocks.serverTasks = [
      {
        id: 'task-1',
        title: 'Existing task',
        status: 'Not Started',
        priority: 'Medium',
        difficulty: 'Easy',
        estimated_mins: 30,
        allow_split: 0,
      },
    ]

    render(<WorkspacePage />)

    await waitForInitialLoad()

    const existingRow = await screen.findByTestId('task-row-task-1')
    fireEvent.click(within(existingRow).getByTitle('Delete'))

    await waitFor(() => {
      expect(screen.queryByTestId('task-row-task-1')).not.toBeInTheDocument()
    })

    fireEvent.keyDown(document, { ctrlKey: true, key: 'z' })

    const restoredRow = await screen.findByTestId('task-row-task-2')
    expect(within(restoredRow).getByRole('button', { name: 'Solid' })).toBeInTheDocument()
  })

  it('Push to Calendar panel can be canceled without scheduling', async () => {
    render(<WorkspacePage />)

    await waitForInitialLoad()

    fireEvent.click(screen.getByRole('button', { name: 'Push to Calendar' }))

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('button', { name: 'Push' })).not.toBeInTheDocument()
    expect(mocks.organize).not.toHaveBeenCalled()
  })
})
