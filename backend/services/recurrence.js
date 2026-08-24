// services/recurrence.js — expand recurring events into occurrences.
//
// Stores an RFC 5545 RRULE string on the master row and expands it at read time,
// so a daily routine is 11 rows rather than 11 x N. Deliberately supports only
// the subset these calendars actually use — DAILY and WEEKLY, with INTERVAL,
// BYDAY, COUNT and UNTIL — instead of pulling in a full iCalendar library.
//
// Occurrences are virtual: they carry an id of `<masterId>::<startISO>` and are
// never persisted. Writes always address the master, so editing or deleting
// affects the whole series (see routes/calendar.js).

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// A hard ceiling so a malformed or unbounded rule cannot spin forever.
const MAX_OCCURRENCES = 750;

/** Parse "RRULE:FREQ=DAILY;INTERVAL=2" into a plain object, or null. */
function parseRRule(raw) {
  if (!raw || typeof raw !== "string") return null;
  const body = raw.replace(/^RRULE:/i, "").trim();
  if (!body) return null;

  const rule = { freq: null, interval: 1, byday: [], count: null, until: null };
  for (const part of body.split(";")) {
    const [rawKey, rawValue] = part.split("=");
    if (!rawKey || rawValue === undefined) continue;
    const key = rawKey.trim().toUpperCase();
    const value = rawValue.trim();

    if (key === "FREQ") rule.freq = value.toUpperCase();
    else if (key === "INTERVAL") rule.interval = Math.max(1, parseInt(value, 10) || 1);
    else if (key === "BYDAY") rule.byday = value.toUpperCase().split(",").map(d => d.slice(-2)).filter(d => DAY_CODES.includes(d));
    else if (key === "COUNT") rule.count = parseInt(value, 10) || null;
    else if (key === "UNTIL") rule.until = parseUntil(value);
  }
  if (rule.freq !== "DAILY" && rule.freq !== "WEEKLY") return null;
  return rule;
}

/** UNTIL is either 20260931T235959Z or a bare date. */
function parseUntil(value) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "23", mi = "59", s = "59"] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Occurrences of `master` overlapping [windowStart, windowEnd].
 * Returns [] when the row is not recurring, so callers can concat blindly.
 */
function expandEvent(master, windowStart, windowEnd) {
  const rule = parseRRule(master.recurrence);
  if (!rule) return [];

  const start = new Date(master.start_time);
  const end = new Date(master.end_time);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const durationMs = Math.max(0, end.getTime() - start.getTime());
  const hardStop = rule.until && rule.until < windowEnd ? rule.until : windowEnd;

  const occurrences = [];
  let cursor = new Date(start.getTime());
  let emitted = 0;
  let guard = 0;

  while (cursor <= hardStop && guard < MAX_OCCURRENCES * 4) {
    guard += 1;

    const matchesDay =
      rule.freq === "DAILY" ||
      rule.byday.length === 0 ||
      rule.byday.includes(DAY_CODES[cursor.getDay()]);

    if (matchesDay) {
      emitted += 1;
      if (rule.count && emitted > rule.count) break;

      const occurrenceEnd = new Date(cursor.getTime() + durationMs);
      // Include anything overlapping the window, not merely starting inside it.
      if (occurrenceEnd >= windowStart && cursor <= windowEnd) {
        occurrences.push({
          ...master,
          id: `${master.id}::${cursor.toISOString()}`,
          recurring_event_id: master.id,
          is_recurring_instance: 1,
          start_time: cursor.toISOString(),
          end_time: occurrenceEnd.toISOString(),
        });
        if (occurrences.length >= MAX_OCCURRENCES) break;
      }
    }

    // WEEKLY with BYDAY still walks day by day; the BYDAY test above filters.
    cursor = rule.freq === "WEEKLY" && rule.byday.length > 0
      ? addDays(cursor, 1)
      : addDays(cursor, rule.freq === "WEEKLY" ? 7 * rule.interval : rule.interval);
  }

  return occurrences;
}

/** Strip the ::occurrence suffix so writes address the stored master row. */
function masterIdOf(id) {
  return typeof id === "string" && id.includes("::") ? id.split("::")[0] : id;
}

module.exports = { parseRRule, expandEvent, masterIdOf, MAX_OCCURRENCES };
