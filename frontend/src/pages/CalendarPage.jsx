import { useState, useEffect, useRef } from "react";

import { DayView } from "../components/calendar/DayView";
import { WeekView } from "../components/calendar/WeekView";
import { MonthView } from "../components/calendar/MonthView";
import { CalendarEventModal } from "../components/calendar/CalendarEventModal";
import { QuickCreatePopover } from "../components/calendar/QuickCreatePopover";
import { Button } from "../components/shared/Button";
import { Spinner } from "../components/shared/Spinner";
import { useCalendarEvents } from "../hooks/useCalendarEvents";
import { useBoardPomodoroState } from "../hooks/useBoardPomodoroState";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import { useToast } from "../context/ToastContext";
import {
  todayISO,
  getWeekStart,
  addDays,
  formatDateLong,
  formatSeconds,
  localDateKey,
  localDateTimeFromMinutes,
} from "../utils/dateHelpers";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const CONTEXT_MENU_WIDTH = 160;
const CONTEXT_MENU_HEIGHT = 88;
const VIEWPORT_PADDING = 12;

export default function CalendarPage({ onRouteRecoverySprintToWorkspace }) {
  const [view, setView] = useState("week"); // 'month' | 'week' | 'day'
  const [currentDate, setCurrentDate] = useState(todayISO());
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [defaultSlot, setDefaultSlot] = useState(null);
  const [quickCreate, setQuickCreate] = useState(null); // { slot, x, y }
  const [contextMenu, setContextMenu] = useState(null); // { event, x, y }
  const [duplicateSource, setDuplicateSource] = useState(null);

  const weekStart = getWeekStart(currentDate);
  const {
    events,
    loading,
    syncing,
    syncFromGoogle,
    createEvent,
    updateEvent,
    deleteEvent,
    undoDeleteEvent,
    reload,
  } = useCalendarEvents();
  const { isBreak, isRunning, timeLeft } = useBoardPomodoroState();
  const { connected, connect } = useGoogleAuth();
  const { addToast } = useToast();

  const [year, month] = currentDate.split("-").map(Number);
  const monthYear = `${MONTH_NAMES[month - 1]} ${year}`;

  // Undo calendar event deletion: Cmd+Z (Mac) / Ctrl+Z (Windows)
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoDeleteEvent();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undoDeleteEvent]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    const handleEscape = (e) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("click", handleClose);
    document.addEventListener("contextmenu", handleClose);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("click", handleClose);
      document.removeEventListener("contextmenu", handleClose);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!duplicateSource) return;
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        setDuplicateSource(null);
        addToast("Duplicate canceled", "info");
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [duplicateSource, addToast]);

  async function handleSync() {
    try {
      const count = await syncFromGoogle();
      addToast(
        `Synced ${count} event${count !== 1 ? "s" : ""} from Google Calendar`,
        "success",
      );
    } catch (err) {
      addToast(err.message, "error");
    }
  }

  function navigate(direction) {
    if (view === "month") {
      const d = new Date(`${currentDate}T00:00:00`);
      d.setMonth(d.getMonth() + (direction === "next" ? 1 : -1));
      setCurrentDate(localDateKey(d));
    } else {
      const delta =
        direction === "next"
          ? view === "week"
            ? 7
            : 1
          : view === "week"
            ? -7
            : -1;
      setCurrentDate((prev) => addDays(prev, delta));
    }
  }

  function goToToday() {
    setCurrentDate(todayISO());
  }

  function openCreateModal(slot = null, e = null) {
    if (duplicateSource && slot) {
      void placeDuplicatedEvent(slot.start_time);
      return;
    }
    if (e) {
      setQuickCreate({ slot, x: e.clientX, y: e.clientY });
    } else {
      setSelectedEvent(null);
      setDefaultSlot(slot);
      setModalOpen(true);
    }
  }

  function openFullModalFromQuick(prefill = {}) {
    setQuickCreate(null);
    setSelectedEvent(null);
    setDefaultSlot(
      prefill.start_time
        ? {
            start_time: prefill.start_time,
            end_time: prefill.end_time,
            title: prefill.title,
          }
        : null,
    );
    setModalOpen(true);
  }

  function openEditModal(event) {
    setContextMenu(null);
    setSelectedEvent(event);
    setDefaultSlot(null);
    setModalOpen(true);
  }

  // Month view day click: 'select' = switch to day view, 'drop' = move event
  function handleMonthDayClick(action, dateStr, eventId) {
    if (action === "select") {
      if (duplicateSource) {
        const originalStart = new Date(duplicateSource.start_time);
        const start = new Date(
          `${dateStr}T${originalStart.toTimeString().slice(0, 8)}`,
        );
        void placeDuplicatedEvent(start.toISOString());
        return;
      }
      setCurrentDate(dateStr);
      setView("day");
    } else if (action === "drop" && eventId) {
      const event = events.find((e) => e.id === eventId);
      if (!event) return;
      const origStart = new Date(event.start_time);
      const origEnd = new Date(event.end_time);
      const durationMs = origEnd.getTime() - origStart.getTime();
      const newStart = localDateTimeFromMinutes(
        dateStr,
        origStart.getHours() * 60 + origStart.getMinutes(),
      );
      const newEnd = new Date(newStart.getTime() + durationMs);
      handleEventDrop(eventId, newStart.toISOString(), newEnd.toISOString());
    }
  }

  function openEventContextMenu(e, event) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = e.clientX;
    let y = e.clientY;

    if (x + CONTEXT_MENU_WIDTH > viewportWidth - VIEWPORT_PADDING) {
      x = Math.max(VIEWPORT_PADDING, e.clientX - CONTEXT_MENU_WIDTH);
    }
    if (y + CONTEXT_MENU_HEIGHT > viewportHeight - VIEWPORT_PADDING) {
      y = Math.max(VIEWPORT_PADDING, e.clientY - CONTEXT_MENU_HEIGHT);
    }

    setContextMenu({ event, x, y });
  }

  async function placeDuplicatedEvent(startISO) {
    if (!duplicateSource) return;
    try {
      const originalStart = new Date(duplicateSource.start_time);
      const originalEnd = new Date(duplicateSource.end_time);
      const durationMs = originalEnd.getTime() - originalStart.getTime();
      const newStart = new Date(startISO);
      const newEnd = new Date(newStart.getTime() + durationMs);

      await createEvent({
        title: duplicateSource.title,
        description: duplicateSource.description ?? "",
        location: duplicateSource.location ?? "",
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        all_day: !!duplicateSource.all_day,
        color: duplicateSource.color,
        color_id: duplicateSource.color_id,
      });
      addToast("Event duplicated", "success");
    } catch (err) {
      addToast(err.message || "Failed to duplicate event", "error");
    } finally {
      setDuplicateSource(null);
    }
  }

  async function handleDeleteFromContext(event) {
    setContextMenu(null);
    await handleDeleteEvent(event.id);
  }

  function handleDuplicateFromContext(event) {
    setContextMenu(null);
    setDuplicateSource(event);
    addToast("Duplicate ready — click a slot or day to place the copy", "info");
  }

  async function handleEventDrop(eventId, newStart, newEnd) {
    try {
      await updateEvent(eventId, { start_time: newStart, end_time: newEnd });
      addToast("Event moved", "success");
    } catch (err) {
      addToast(err.message, "error");
    }
  }

  async function handleSaveEvent(fields) {
    try {
      if (selectedEvent) {
        await updateEvent(selectedEvent.id, fields);
        addToast("Event updated", "success");
      } else {
        await createEvent(fields);
        addToast("Event created", "success");
      }
    } catch (err) {
      addToast(err.message, "error");
      throw err;
    }
  }

  async function handleDeleteEvent(id) {
    try {
      await deleteEvent(id);
      addToast("Event deleted — Cmd+Z to undo", "info");
    } catch (err) {
      addToast(err.message, "error");
      throw err;
    }
  }

  const displayLabel =
    view === "month"
      ? monthYear
      : view === "week"
        ? `${formatDateLong(weekStart)} – ${formatDateLong(addDays(weekStart, 6))}`
        : formatDateLong(currentDate);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-notion-bg">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-notion-border">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate("prev")}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-notion-muted hover:bg-notion-hover hover:text-notion-text transition-colors"
          >
            ‹
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-xs font-medium text-notion-muted hover:bg-notion-hover hover:text-notion-text rounded-lg transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => navigate("next")}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-notion-muted hover:bg-notion-hover hover:text-notion-text transition-colors"
          >
            ›
          </button>
        </div>

        <span className="text-sm font-semibold text-notion-text flex-1">
          {displayLabel}
        </span>

        <div className="flex items-center gap-2">
          {isRunning && (
            <div
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5"
              style={{
                borderColor: isBreak
                  ? "rgba(103,232,249,0.35)"
                  : "rgba(252,129,129,0.35)",
                background: isBreak
                  ? "rgba(26,107,138,0.18)"
                  : "rgba(155,44,44,0.18)",
              }}
              title={isBreak ? "Break timer running" : "Focus timer running"}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: isBreak ? "#67e8f9" : "#fc8181" }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: "var(--color-notion-text)" }}
              >
                {isBreak ? "Break" : "Focus"}
              </span>
              <span
                className="text-xs font-semibold tabular-nums"
                style={{ color: "var(--color-notion-text)" }}
              >
                {formatSeconds(timeLeft)}
              </span>
            </div>
          )}

          {/* View toggle */}
          <div className="flex bg-notion-surface border border-notion-border rounded-lg overflow-hidden">
            {["month", "week", "day"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === v
                    ? "bg-notion-hover text-notion-text"
                    : "text-notion-muted hover:text-notion-text"
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* Sync button */}
          {connected ? (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-notion-muted hover:text-notion-text hover:bg-notion-hover rounded-lg transition-colors disabled:opacity-50"
            >
              <span className={syncing ? "animate-spin inline-block" : ""}>
                ↻
              </span>
              {syncing ? "Syncing…" : "Sync"}
            </button>
          ) : (
            <button
              onClick={connect}
              className="text-xs text-indigo-400 hover:underline"
            >
              Connect Google
            </button>
          )}
        </div>
      </div>

      {/* Calendar body */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          {view === "month" ? (
            <MonthView
              year={year}
              month={month - 1}
              events={events}
              onDayClick={handleMonthDayClick}
              onEventClick={openEditModal}
              onEventContextMenu={openEventContextMenu}
            />
          ) : view === "week" ? (
            <WeekView
              weekStart={weekStart}
              events={events}
              onEventClick={openEditModal}
              onEventContextMenu={openEventContextMenu}
              onSlotClick={openCreateModal}
              onEventDrop={handleEventDrop}
            />
          ) : (
            <DayView
              date={currentDate}
              events={events}
              onEventClick={openEditModal}
              onEventContextMenu={openEventContextMenu}
              onSlotClick={openCreateModal}
              onEventDrop={handleEventDrop}
            />
          )}
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 min-w-40 rounded-lg border border-notion-border bg-notion-surface shadow-2xl overflow-hidden"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-2 text-left text-sm text-notion-text hover:bg-notion-hover transition-colors"
            onClick={() => handleDuplicateFromContext(contextMenu.event)}
          >
            Duplicate
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-notion-hover transition-colors"
            onClick={() => handleDeleteFromContext(contextMenu.event)}
          >
            Delete
          </button>
        </div>
      )}

      {/* Quick-create popover (click on time slot) */}
      {quickCreate && (
        <QuickCreatePopover
          x={quickCreate.x}
          y={quickCreate.y}
          slot={quickCreate.slot}
          onSave={async (fields) => {
            try {
              await createEvent(fields);
              addToast("Event created", "success");
            } catch (err) {
              addToast(err.message, "error");
            }
          }}
          onMoreOptions={openFullModalFromQuick}
          onClose={() => setQuickCreate(null)}
        />
      )}

      {/* Full event create/edit modal */}
      <CalendarEventModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedEvent(null);
          setDefaultSlot(null);
        }}
        onSave={handleSaveEvent}
        onDelete={selectedEvent ? handleDeleteEvent : undefined}
        event={selectedEvent}
        defaultStart={defaultSlot?.start_time}
        defaultEnd={defaultSlot?.end_time}
        defaultTitle={defaultSlot?.title ?? ""}
      />
    </div>
  );
}
