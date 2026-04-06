const test = require("node:test");
const assert = require("node:assert/strict");

const {
  localISO,
  buildSchedulingWindows,
  toOccupiedIntervals,
  addOccupiedInterval,
  findSolidSlot,
  findNextSplitChunk,
} = require("./calendarOrganizer");

test("solid tasks backfill the earliest open gap instead of inheriting a global cursor", () => {
  const startAt = new Date("2026-04-06T08:00:00");
  const windows = buildSchedulingWindows({
    date: "2026-04-06",
    nextDate: "2026-04-07",
    startAt,
    dayStartHour: 8,
    dayEndHour: 23,
  });

  const occupied = toOccupiedIntervals([
    { id: "event-1", start_time: "2026-04-06T08:30:00", end_time: "2026-04-06T09:00:00" },
  ], windows[0].start, windows[windows.length - 1].end);

  const largeTaskSlot = findSolidSlot({
    occupiedIntervals: occupied,
    windows,
    startAt,
    durationMins: 90,
  });

  assert.equal(localISO(largeTaskSlot.start), "2026-04-06T09:00:00");
  assert.equal(localISO(largeTaskSlot.end), "2026-04-06T10:30:00");

  addOccupiedInterval(occupied, largeTaskSlot);

  const smallTaskSlot = findSolidSlot({
    occupiedIntervals: occupied,
    windows,
    startAt,
    durationMins: 30,
  });

  assert.equal(localISO(smallTaskSlot.start), "2026-04-06T08:00:00");
  assert.equal(localISO(smallTaskSlot.end), "2026-04-06T08:30:00");
});

test("spanning events from the previous day still block the next morning", () => {
  const startAt = new Date("2026-04-06T08:00:00");
  const windows = buildSchedulingWindows({
    date: "2026-04-06",
    nextDate: "2026-04-07",
    startAt,
    dayStartHour: 8,
    dayEndHour: 23,
  });

  const occupied = toOccupiedIntervals([
    { id: "overnight", start_time: "2026-04-05T23:30:00", end_time: "2026-04-06T08:45:00" },
  ], windows[0].start, windows[windows.length - 1].end);

  const slot = findSolidSlot({
    occupiedIntervals: occupied,
    windows,
    startAt,
    durationMins: 30,
  });

  assert.equal(localISO(slot.start), "2026-04-06T09:00:00");
  assert.equal(localISO(slot.end), "2026-04-06T09:30:00");
});

test("split tasks use the earliest valid gaps and keep 4 minute buffers around events", () => {
  const startAt = new Date("2026-04-06T08:00:00");
  const windows = buildSchedulingWindows({
    date: "2026-04-06",
    nextDate: "2026-04-07",
    startAt,
    dayStartHour: 8,
    dayEndHour: 23,
  });

  const occupied = toOccupiedIntervals([
    { id: "event-1", start_time: "2026-04-06T08:30:00", end_time: "2026-04-06T09:00:00" },
    { id: "event-2", start_time: "2026-04-06T10:00:00", end_time: "2026-04-06T10:20:00" },
    { id: "event-3", start_time: "2026-04-06T11:00:00", end_time: "2026-04-06T11:30:00" },
  ], windows[0].start, windows[windows.length - 1].end);

  let remaining = 90;

  const chunk1 = findNextSplitChunk({
    occupiedIntervals: occupied,
    windows,
    startAt,
    remainingMins: remaining,
  });

  assert.equal(localISO(chunk1.start), "2026-04-06T08:00:00");
  assert.equal(localISO(chunk1.end), "2026-04-06T08:26:00");
  assert.equal(localISO(chunk1.resumeAt), "2026-04-06T09:04:00");

  addOccupiedInterval(occupied, chunk1);
  remaining -= chunk1.minsScheduled;

  const chunk2 = findNextSplitChunk({
    occupiedIntervals: occupied,
    windows,
    startAt: chunk1.resumeAt,
    remainingMins: remaining,
  });

  assert.equal(localISO(chunk2.start), "2026-04-06T09:04:00");
  assert.equal(localISO(chunk2.end), "2026-04-06T09:56:00");
  assert.equal(localISO(chunk2.resumeAt), "2026-04-06T10:24:00");

  addOccupiedInterval(occupied, chunk2);
  remaining -= chunk2.minsScheduled;

  const chunk3 = findNextSplitChunk({
    occupiedIntervals: occupied,
    windows,
    startAt: chunk2.resumeAt,
    remainingMins: remaining,
  });

  assert.equal(localISO(chunk3.start), "2026-04-06T10:24:00");
  assert.equal(localISO(chunk3.end), "2026-04-06T10:36:00");
  assert.equal(chunk3.minsScheduled, 12);
});

test("split tasks do not skip a small earliest gap just because a larger one exists later", () => {
  const startAt = new Date("2026-04-06T08:00:00");
  const windows = buildSchedulingWindows({
    date: "2026-04-06",
    nextDate: "2026-04-07",
    startAt,
    dayStartHour: 8,
    dayEndHour: 23,
  });

  const occupied = toOccupiedIntervals([
    { id: "event-1", start_time: "2026-04-06T08:10:00", end_time: "2026-04-06T08:20:00" },
    { id: "event-2", start_time: "2026-04-06T09:00:00", end_time: "2026-04-06T09:30:00" },
  ], windows[0].start, windows[windows.length - 1].end);

  const chunk = findNextSplitChunk({
    occupiedIntervals: occupied,
    windows,
    startAt,
    remainingMins: 60,
  });

  assert.equal(localISO(chunk.start), "2026-04-06T08:00:00");
  assert.equal(localISO(chunk.end), "2026-04-06T08:06:00");
  assert.equal(chunk.minsScheduled, 6);
  assert.equal(localISO(chunk.resumeAt), "2026-04-06T08:24:00");
});
