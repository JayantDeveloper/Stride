const SPLIT_MARGIN_MS = 4 * 60_000;
const MIN_SPLIT_GAP_MS = 60_000;
const DEFAULT_TIME_ZONE =
  process.env.GOOGLE_CALENDAR_TIMEZONE ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  "UTC";

const zonedFormatterCache = new Map();

function pad(n) {
  return String(n).padStart(2, "0");
}

function getZonedFormatter(timeZone = DEFAULT_TIME_ZONE) {
  if (!zonedFormatterCache.has(timeZone)) {
    zonedFormatterCache.set(timeZone, new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }));
  }

  return zonedFormatterCache.get(timeZone);
}

function getZonedParts(input, timeZone = DEFAULT_TIME_ZONE) {
  const date = input instanceof Date ? input : new Date(input);
  const parts = getZonedFormatter(timeZone).formatToParts(date);
  const valueByType = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(valueByType.year),
    month: Number(valueByType.month),
    day: Number(valueByType.day),
    hour: Number(valueByType.hour),
    minute: Number(valueByType.minute),
    second: Number(valueByType.second),
  };
}

function getTimeZoneOffsetMs(input, timeZone = DEFAULT_TIME_ZONE) {
  const date = input instanceof Date ? input : new Date(input);
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone = DEFAULT_TIME_ZONE) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = new Date(utcGuess);
  let offset = getTimeZoneOffsetMs(candidate, timeZone);
  candidate = new Date(utcGuess - offset);

  const correctedOffset = getTimeZoneOffsetMs(candidate, timeZone);
  if (correctedOffset !== offset) {
    candidate = new Date(utcGuess - correctedOffset);
  }

  return candidate;
}

function shiftDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dateStr(input, timeZone = DEFAULT_TIME_ZONE) {
  const parts = getZonedParts(input, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function localISO(input, timeZone = DEFAULT_TIME_ZONE) {
  const parts = getZonedParts(input, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function parseCalendarDateTime(value, timeZone = DEFAULT_TIME_ZONE) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const dateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    return zonedDateTimeToUtc({
      year: Number(dateMatch[1]),
      month: Number(dateMatch[2]),
      day: Number(dateMatch[3]),
    }, timeZone);
  }

  const localDateTimeMatch = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/
  );
  if (localDateTimeMatch) {
    return zonedDateTimeToUtc({
      year: Number(localDateTimeMatch[1]),
      month: Number(localDateTimeMatch[2]),
      day: Number(localDateTimeMatch[3]),
      hour: Number(localDateTimeMatch[4]),
      minute: Number(localDateTimeMatch[5]),
      second: Number(localDateTimeMatch[6] ?? 0),
    }, timeZone);
  }

  const parsed = new Date(raw);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function snapTo30(input, timeZone = DEFAULT_TIME_ZONE) {
  const parts = getZonedParts(input, timeZone);
  const mins = parts.minute;
  const next = Math.ceil(mins / 30) * 30;
  const wallClock = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, 0, 0));
  if (next >= 60) wallClock.setUTCHours(wallClock.getUTCHours() + 1);
  else wallClock.setUTCMinutes(next);

  return zonedDateTimeToUtc({
    year: wallClock.getUTCFullYear(),
    month: wallClock.getUTCMonth() + 1,
    day: wallClock.getUTCDate(),
    hour: wallClock.getUTCHours(),
    minute: wallClock.getUTCMinutes(),
    second: 0,
  }, timeZone);
}

function buildSchedulingWindows({ date, nextDate, startAt, dayStartHour = 8, dayEndHour = 23, timeZone = DEFAULT_TIME_ZONE }) {
  const days = [date, nextDate].filter(Boolean);

  return days.flatMap((day) => {
    const windowStart = parseCalendarDateTime(`${day}T${pad(dayStartHour)}:00:00`, timeZone);
    const windowEnd = parseCalendarDateTime(`${day}T${pad(dayEndHour)}:00:00`, timeZone);
    const actualStart = new Date(Math.max(windowStart.getTime(), startAt.getTime()));
    if (actualStart >= windowEnd) return [];
    return [{ day, start: actualStart, end: windowEnd }];
  });
}

function overlapsRange(start, end, rangeStart, rangeEnd) {
  return start < rangeEnd && end > rangeStart;
}

function toOccupiedIntervals(events, rangeStart, rangeEnd, timeZone = DEFAULT_TIME_ZONE) {
  return events
    .flatMap((event) => {
      const start = parseCalendarDateTime(event.start_time, timeZone);
      const end = parseCalendarDateTime(event.end_time, timeZone);
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
  DEFAULT_TIME_ZONE,
  SPLIT_MARGIN_MS,
  MIN_SPLIT_GAP_MS,
  shiftDateKey,
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
