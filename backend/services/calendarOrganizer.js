const SPLIT_MARGIN_MS = 4 * 60_000;
const MIN_SPLIT_GAP_MS = 60_000;

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateStr(input) {
  const d = input instanceof Date ? input : new Date(input);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localISO(input) {
  const d = input instanceof Date ? input : new Date(input);
  return `${dateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function parseCalendarDateTime(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(raw);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function snapTo30(input) {
  const d = new Date(input);
  d.setSeconds(0, 0);
  const mins = d.getMinutes();
  const next = Math.ceil(mins / 30) * 30;
  if (next >= 60) {
    d.setMinutes(0);
    d.setHours(d.getHours() + 1);
  } else {
    d.setMinutes(next);
  }
  return d;
}

function buildSchedulingWindows({ date, nextDate, startAt, dayStartHour = 8, dayEndHour = 23 }) {
  const days = [date, nextDate].filter(Boolean);

  return days.flatMap((day) => {
    const windowStart = new Date(`${day}T${pad(dayStartHour)}:00:00`);
    const windowEnd = new Date(`${day}T${pad(dayEndHour)}:00:00`);
    const actualStart = new Date(Math.max(windowStart.getTime(), startAt.getTime()));
    if (actualStart >= windowEnd) return [];
    return [{ day, start: actualStart, end: windowEnd }];
  });
}

function overlapsRange(start, end, rangeStart, rangeEnd) {
  return start < rangeEnd && end > rangeStart;
}

function toOccupiedIntervals(events, rangeStart, rangeEnd) {
  return events
    .flatMap((event) => {
      const start = parseCalendarDateTime(event.start_time);
      const end = parseCalendarDateTime(event.end_time);
      if (!start || !end || end <= start) return [];
      if (!overlapsRange(start, end, rangeStart, rangeEnd)) return [];
      return [{ id: event.id, start, end, event }];
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function addOccupiedInterval(intervals, interval) {
  if (!interval?.start || !interval?.end || interval.end <= interval.start) return intervals;
  intervals.push({
    start: new Date(interval.start),
    end: new Date(interval.end),
    event: interval.event ?? null,
  });
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  return intervals;
}

function findSolidSlot({ occupiedIntervals, windows, startAt, durationMins }) {
  const requiredMs = Math.max(1, durationMins) * 60_000;

  for (const window of windows) {
    let cursor = snapTo30(new Date(Math.max(window.start.getTime(), startAt.getTime())));
    if (cursor >= window.end) continue;

    for (const interval of occupiedIntervals) {
      if (interval.end <= cursor) continue;
      if (interval.start >= window.end) break;

      if (interval.start > cursor) {
        const gapMs = interval.start.getTime() - cursor.getTime();
        if (gapMs >= requiredMs) {
          return {
            start: new Date(cursor),
            end: new Date(cursor.getTime() + requiredMs),
          };
        }
      }

      if (interval.end > cursor) {
        cursor = snapTo30(interval.end);
        if (cursor >= window.end) break;
      }
    }

    if (window.end.getTime() - cursor.getTime() >= requiredMs) {
      return {
        start: new Date(cursor),
        end: new Date(cursor.getTime() + requiredMs),
      };
    }
  }

  return null;
}

function findNextSplitChunk({ occupiedIntervals, windows, startAt, remainingMins }) {
  for (const window of windows) {
    let cursor = new Date(Math.max(window.start.getTime(), startAt.getTime()));
    if (cursor >= window.end) continue;

    for (const interval of occupiedIntervals) {
      if (interval.end.getTime() + SPLIT_MARGIN_MS <= cursor.getTime()) continue;
      if (interval.start >= window.end) break;

      const gapEndMs = Math.min(window.end.getTime(), interval.start.getTime() - SPLIT_MARGIN_MS);
      const gapMs = gapEndMs - cursor.getTime();

      if (gapMs >= MIN_SPLIT_GAP_MS) {
        const chunkMins = Math.min(Math.floor(gapMs / 60_000), remainingMins);
        if (chunkMins > 0) {
          return {
            start: new Date(cursor),
            end: new Date(cursor.getTime() + chunkMins * 60_000),
            minsScheduled: chunkMins,
            resumeAt: new Date(interval.end.getTime() + SPLIT_MARGIN_MS),
          };
        }
      }

      const nextCursorMs = interval.end.getTime() + SPLIT_MARGIN_MS;
      if (nextCursorMs > cursor.getTime()) {
        cursor = new Date(nextCursorMs);
        if (cursor >= window.end) break;
      }
    }

    const tailGapMs = window.end.getTime() - cursor.getTime();
    if (tailGapMs >= MIN_SPLIT_GAP_MS) {
      const chunkMins = Math.min(Math.floor(tailGapMs / 60_000), remainingMins);
      if (chunkMins > 0) {
        return {
          start: new Date(cursor),
          end: new Date(cursor.getTime() + chunkMins * 60_000),
          minsScheduled: chunkMins,
          resumeAt: new Date(window.end),
        };
      }
    }
  }

  return null;
}

module.exports = {
  SPLIT_MARGIN_MS,
  MIN_SPLIT_GAP_MS,
  dateStr,
  localISO,
  parseCalendarDateTime,
  snapTo30,
  buildSchedulingWindows,
  toOccupiedIntervals,
  addOccupiedInterval,
  findSolidSlot,
  findNextSplitChunk,
};
