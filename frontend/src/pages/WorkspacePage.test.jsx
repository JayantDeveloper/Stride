import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { vi } from "vitest";
import WorkspacePage from "./WorkspacePage";

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  organize: vi.fn(async () => ({ scheduled: [] })),
  reloadEvents: vi.fn(),
  startSprintNow: vi.fn(),
  moveToNextOpenSlot: vi.fn(),
  dismissRecovery: vi.fn(),
  rolloverToTomorrow: vi.fn(async () => ({ scheduled: [] })),
  isEndOfDay: false,
  recoveryBlock: null,
  recoveryRecommendation: null,
  recoveryRollover: null,
  nextTaskId: 2,
  serverTasks: [
    {
      id: "task-1",
      title: "High task",
      position: 1,
      status: "Not Started",
      priority: "High",
      difficulty: "Easy",
      estimated_mins: 30,
      allow_split: 0,
    },
    {
      id: "task-2",
      title: "Low task",
      position: 2,
      status: "Not Started",
      priority: "Low",
      difficulty: "Easy",
      estimated_mins: 30,
      allow_split: 0,
    },
  ],
}));

vi.mock("../utils/apiClient", () => ({
  apiRequest: async (url, options = {}) => {
    const method = String(options.method ?? "GET").toUpperCase();
    const body = options.body ?? {};

    if (method === "GET" && String(url).startsWith("/api/tasks")) {
      return { tasks: mocks.serverTasks };
    }

    if (method === "POST" && url === "/api/tasks") {
      const task = {
        id: `task-${mocks.nextTaskId++}`,
        title: body.title ?? "New task",
        position: body.position ?? mocks.serverTasks.length + 1,
        status: body.status ?? "Not Started",
        priority: body.priority ?? "Medium",
        difficulty: body.difficulty ?? "Easy",
        estimated_mins: body.estimated_mins ?? 30,
        allow_split: body.allow_split ?? 1,
        due_date: body.due_date ?? null,
        scheduled_date: body.scheduled_date ?? null,
        description: body.description ?? "",
        tags: body.tags ?? [],
      };
      mocks.serverTasks = [...mocks.serverTasks, task];
      return { task };
    }

    const taskMatch = String(url).match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && method === "PATCH") {
      const taskId = taskMatch[1];
      const task = mocks.serverTasks.find((item) => item.id === taskId);
      if (!task) throw new Error("Task not found");
      Object.assign(task, body);
      return { task };
    }

    if (taskMatch && method === "DELETE") {
      const taskId = taskMatch[1];
      mocks.serverTasks = mocks.serverTasks.filter(
        (item) => item.id !== taskId,
      );
      return { ok: true };
    }

    throw new Error(`Unhandled apiRequest mock: ${method} ${url}`);
  },
}));

vi.mock("../utils/dateHelpers", async () => {
  const actual = await vi.importActual("../utils/dateHelpers");
  return {
    ...actual,
    isEndOfDayRolloverTime: () => mocks.isEndOfDay,
  };
});

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}));

vi.mock("../hooks/useAIOrganize", () => ({
  useOrganize: () => ({
    organize: mocks.organize,
    loading: false,
  }),
}));

vi.mock("../hooks/useCalendarEvents", () => ({
  useCalendarEvents: () => ({
    reload: mocks.reloadEvents,
  }),
}));

vi.mock("../hooks/useTaskActivationAI", () => ({
  useTaskActivationAI: () => ({
    loadingAction: "",
    getBreakdown: vi.fn(),
  }),
}));

vi.mock("../components/tasks/TaskModal", () => ({
  TaskModal: () => null,
}));

vi.mock("../components/tasks/AddToCalendarModal", () => ({
  AddToCalendarModal: () => null,
}));

vi.mock("../components/execute/CheckInModal", () => ({
  CheckInModal: () => null,
}));

vi.mock("../components/execute/ExecutionPomodoro", () => ({
  ExecutionPomodoro: () => null,
}));

vi.mock("../components/shared/Spinner", () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

describe("WorkspacePage regressions", () => {
  async function waitForInitialLoad() {
    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });
  }

  beforeEach(() => {
    mocks.nextTaskId = 2;
    mocks.serverTasks = [
      {
        id: "task-1",
        title: "High task",
        position: 1,
        status: "Not Started",
        priority: "High",
        difficulty: "Easy",
        estimated_mins: 30,
        allow_split: 0,
      },
      {
        id: "task-2",
        title: "Low task",
        position: 2,
        status: "Not Started",
        priority: "Low",
        difficulty: "Easy",
        estimated_mins: 30,
        allow_split: 0,
      },
    ];
    mocks.nextTaskId = 3;
    mocks.addToast.mockReset();
    mocks.organize.mockClear();
    mocks.reloadEvents.mockClear();
    mocks.startSprintNow.mockClear();
    mocks.moveToNextOpenSlot.mockClear();
    mocks.dismissRecovery.mockClear();
    mocks.rolloverToTomorrow.mockClear();
    mocks.isEndOfDay = false;
    mocks.recoveryBlock = null;
    mocks.recoveryRecommendation = null;
    mocks.recoveryRollover = null;
  });

  it("new task renders as a normal row at the very bottom of the list", async () => {
    const { container } = render(<WorkspacePage />);
    const listContainer = container.querySelector("div.flex-1.overflow-y-auto");

    await waitForInitialLoad();
    fireEvent.click(screen.getByRole("button", { name: "+ Task" }));

    const newRow = await screen.findByTestId("task-row-task-3");
    const lowTask = within(listContainer).getByText("Low task");

    expect(listContainer).toBeInTheDocument();
    expect(listContainer).toContainElement(newRow);
    expect(screen.queryByPlaceholderText("New task")).not.toBeInTheDocument();
    expect(within(newRow).getByText("New task")).toBeInTheDocument();
    expect(
      within(newRow).getByRole("button", { name: "Split" }),
    ).toBeInTheDocument();
    expect(
      lowTask.compareDocumentPosition(newRow) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("clicking the added row still lets the user edit it inline", async () => {
    render(<WorkspacePage />);

    await waitForInitialLoad();
    fireEvent.click(screen.getByRole("button", { name: "+ Task" }));

    const row = await screen.findByTestId("task-row-task-3");
    fireEvent.click(within(row).getByText("New task"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("New task")).toBeInTheDocument();
    });
  });

  it("undo delete preserves a Solid task instead of recreating it as Split", async () => {
    mocks.serverTasks = [
      {
        id: "task-1",
        title: "Existing task",
        status: "Not Started",
        priority: "Medium",
        difficulty: "Easy",
        estimated_mins: 30,
        allow_split: 0,
      },
    ];

    render(<WorkspacePage />);

    await waitForInitialLoad();

    const existingRow = await screen.findByTestId("task-row-task-1");
    fireEvent.click(within(existingRow).getByTitle("Delete"));

    await waitFor(() => {
      expect(screen.queryByTestId("task-row-task-1")).not.toBeInTheDocument();
    });

    fireEvent.keyDown(document, { ctrlKey: true, key: "z" });

    const restoredRow = await screen.findByTestId("task-row-task-3");
    expect(
      within(restoredRow).getByRole("button", { name: "Solid" }),
    ).toBeInTheDocument();
  });

  it("Push to Calendar panel can be canceled without scheduling", async () => {
    render(<WorkspacePage />);

    await waitForInitialLoad();

    fireEvent.click(screen.getByRole("button", { name: "Push to Calendar" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("button", { name: "Push" }),
    ).not.toBeInTheDocument();
    expect(mocks.organize).not.toHaveBeenCalled();
  });

  it("Push to Calendar panel hides after successful scheduling", async () => {
    render(<WorkspacePage />);

    await waitForInitialLoad();

    fireEvent.click(screen.getByRole("button", { name: "Push to Calendar" }));

    expect(screen.getByRole("button", { name: "Push" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Push" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Push" }),
      ).not.toBeInTheDocument();
    });
    expect(mocks.organize).toHaveBeenCalledTimes(1);
  });

  it("keeps recovery same-day only before 10 PM", async () => {
    mocks.recoveryBlock = {
      id: "block-1",
      task_id: "task-1",
      task_title: "Existing task",
      title: "Existing task",
      start_time: "2026-04-08T18:00:00",
      end_time: "2026-04-08T18:30:00",
      recovery_options: {
        move_next_open_slot: {
          start_time: "2026-04-08T19:00:00",
          end_time: "2026-04-08T19:30:00",
        },
      },
    };
    mocks.recoveryRecommendation = {
      card_text: "Try to recover this block today.",
    };

    render(<WorkspacePage />);

    await waitForInitialLoad();

    expect(
      screen.getByRole("button", { name: "Start 10-min sprint now" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move to next open slot" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Defer to tomorrow" }),
    ).not.toBeInTheDocument();
  });

  it("shows the end-of-day rollover action after 10 PM", async () => {
    mocks.isEndOfDay = true;
    mocks.recoveryRollover = {
      today_block_count: 2,
      affected_task_count: 1,
      tomorrow_date: "2026-04-09",
    };

    render(<WorkspacePage />);

    await waitForInitialLoad();

    const moveButton = screen.getByRole("button", {
      name: "Move unfinished work to tomorrow",
    });
    expect(moveButton).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start 10-min sprint now" }),
    ).not.toBeInTheDocument();

    fireEvent.click(moveButton);

    expect(mocks.rolloverToTomorrow).toHaveBeenCalledTimes(1);
  });
});
