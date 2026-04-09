const { google } = require("googleapis");

const DEFAULT_TIME_ZONE =
  process.env.GOOGLE_CALENDAR_TIMEZONE ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  "UTC";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

async function getAuthenticatedClient(userId) {
  const { getGoogleAccessToken, getGoogleAccountForUser } = await import("../auth.mjs");

  const account = await getGoogleAccountForUser(userId);
  if (!account) throw new Error("Google Calendar not connected");

  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) throw new Error("Google Calendar token unavailable");

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

async function listEvents(userId, startTime, endTime) {
  const auth = await getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: startTime,
    timeMax: endTime,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });

  return (response.data.items || []).map(normalizeEvent);
}

async function createEvent(userId, { title, description = "", location = "", startTime, endTime, colorId }) {
  const auth = await getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: title,
      description,
      location,
      start: { dateTime: startTime, timeZone: DEFAULT_TIME_ZONE },
      end: { dateTime: endTime, timeZone: DEFAULT_TIME_ZONE },
      colorId: colorId || "9",
    },
  });

  return normalizeEvent(response.data);
}

async function updateEvent(userId, googleEventId, { title, description, location, startTime, endTime, colorId }) {
  const auth = await getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: "v3", auth });

  const patch = {};
  if (title !== undefined) patch.summary = title;
  if (description !== undefined) patch.description = description;
  if (location !== undefined) patch.location = location;
  if (colorId !== undefined) patch.colorId = colorId;
  if (startTime !== undefined) patch.start = { dateTime: startTime, timeZone: DEFAULT_TIME_ZONE };
  if (endTime !== undefined) patch.end = { dateTime: endTime, timeZone: DEFAULT_TIME_ZONE };

  const response = await calendar.events.patch({
    calendarId: "primary",
    eventId: googleEventId,
    requestBody: patch,
  });

  return normalizeEvent(response.data);
}

async function deleteEvent(userId, googleEventId) {
  const auth = await getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({ calendarId: "primary", eventId: googleEventId });
}

function normalizeEvent(event) {
  const start = event.start?.dateTime ?? event.start?.date ?? "";
  const end = event.end?.dateTime ?? event.end?.date ?? "";
  const allDay = !event.start?.dateTime;
  return {
    id: event.id,
    title: event.summary ?? "(No title)",
    description: event.description ?? "",
    location: event.location ?? "",
    start_time: start,
    end_time: end,
    all_day: allDay ? 1 : 0,
    color_id: event.colorId ?? "",
    status: event.status,
  };
}

function computeFreeSlots(events, date, workStart = "09:00", workEnd = "18:00") {
  const dateStr = date;
  const dayStart = new Date(`${dateStr}T${workStart}:00`);
  const dayEnd = new Date(`${dateStr}T${workEnd}:00`);

  const dayEvents = events
    .filter((event) => {
      const start = new Date(event.start_time);
      return start >= dayStart && start < dayEnd;
    })
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  const slots = [];
  let cursor = dayStart;

  for (const event of dayEvents) {
    const eventStart = new Date(event.start_time);
    const eventEnd = new Date(event.end_time);
    if (eventStart > cursor) {
      const gapMins = (eventStart - cursor) / 60000;
      if (gapMins >= 20) {
        slots.push({
          start: cursor.toISOString(),
          end: eventStart.toISOString(),
          duration_mins: Math.round(gapMins),
        });
      }
    }
    if (eventEnd > cursor) cursor = eventEnd;
  }

  if (cursor < dayEnd) {
    const gapMins = (dayEnd - cursor) / 60000;
    if (gapMins >= 20) {
      slots.push({
        start: cursor.toISOString(),
        end: dayEnd.toISOString(),
        duration_mins: Math.round(gapMins),
      });
    }
  }

  return slots;
}

module.exports = {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  computeFreeSlots,
};
