// services/googleCalendar.js — Google Calendar API wrapper
// Handles token refresh, event listing, and event creation.

const { google } = require("googleapis");
const db = require("../db/database");

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

// Load stored credentials, refresh if needed, return authenticated client
async function getAuthenticatedClient() {
  const creds = db.prepare("SELECT * FROM google_credentials WHERE id = 1").get();
  if (!creds?.access_token) throw new Error("Google Calendar not connected");

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: creds.access_token,
    refresh_token: creds.refresh_token,
    expiry_date: creds.token_expiry ? new Date(creds.token_expiry).getTime() : undefined,
  });

  // Refresh token if expired or within 5 minutes of expiry
  const expiryMs = creds.token_expiry ? new Date(creds.token_expiry).getTime() : 0;
  const fiveMinMs = 5 * 60 * 1000;
  if (expiryMs - Date.now() < fiveMinMs) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      db.prepare(`
        UPDATE google_credentials
        SET access_token = ?, token_expiry = ?, updated_at = datetime('now')
        WHERE id = 1
      `).run(
        credentials.access_token,
        credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null
      );
    } catch (e) {
      console.error("Token refresh failed:", e.message);
      throw new Error("Google Calendar token expired — please reconnect");
    }
  }

  return oauth2Client;
}

// List events from primary calendar between start and end (ISO datetime strings)
async function listEvents(startTime, endTime) {
  const auth = await getAuthenticatedClient();
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: startTime,
    timeMax: endTime,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  return (response.data.items || []).map(normalizeEvent);
}

// Create an event in primary calendar, returns the created Google event
async function createEvent({ title, description = "", location = "", startTime, endTime, colorId }) {
  const auth = await getAuthenticatedClient();
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: title,
      description,
      location,
      start: { dateTime: startTime, timeZone: DEFAULT_TIME_ZONE },
      end: { dateTime: endTime, timeZone: DEFAULT_TIME_ZONE },
      colorId: colorId || "9", // blueberry — distinguishes task blocks from regular events
    },
  });

  return normalizeEvent(response.data);
}

// Update an event in primary calendar
async function updateEvent(googleEventId, { title, description, location, startTime, endTime, colorId }) {
  const auth = await getAuthenticatedClient();
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

// Delete an event from primary calendar
async function deleteEvent(googleEventId) {
  const auth = await getAuthenticatedClient();
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({ calendarId: "primary", eventId: googleEventId });
}

// Generate the OAuth authorization URL
function getAuthUrl(state) {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // ensures refresh_token is always returned
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
  });
}

// Exchange code for tokens, store in DB, return email
async function handleCallback(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Get user email
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email;

  db.prepare(`
    INSERT OR REPLACE INTO google_credentials
      (id, access_token, refresh_token, token_expiry, email, updated_at)
    VALUES
      (1, ?, ?, ?, ?, datetime('now'))
  `).run(
    tokens.access_token,
    tokens.refresh_token ?? null,
    tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    email
  );

  return { email };
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

// Compute free slots for a given date between workStart and workEnd
// Excludes times already occupied by events
function computeFreeSlots(events, date, workStart = "09:00", workEnd = "18:00") {
  const dateStr = date; // YYYY-MM-DD
  const tzOffset = new Date().getTimezoneOffset() * -1; // local tz offset in minutes

  const dayStart = new Date(`${dateStr}T${workStart}:00`);
  const dayEnd = new Date(`${dateStr}T${workEnd}:00`);

  // Filter to events on this date
  const dayEvents = events
    .filter(e => {
      const s = new Date(e.start_time);
      return s >= dayStart && s < dayEnd;
    })
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  const slots = [];
  let cursor = dayStart;

  for (const event of dayEvents) {
    const evStart = new Date(event.start_time);
    const evEnd = new Date(event.end_time);
    if (evStart > cursor) {
      const gapMins = (evStart - cursor) / 60000;
      if (gapMins >= 20) { // only include slots ≥ 20 min
        slots.push({
          start: cursor.toISOString(),
          end: evStart.toISOString(),
          duration_mins: Math.round(gapMins),
        });
      }
    }
    if (evEnd > cursor) cursor = evEnd;
  }

  // Slot after last event
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

module.exports = { getAuthUrl, handleCallback, listEvents, createEvent, updateEvent, deleteEvent, computeFreeSlots };
