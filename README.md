# focus-exec — AI Productivity Execution System

A personal AI-powered productivity tool that combines Google Calendar, task management, an AI scheduling layer, and an accountability-focused execution loop.

> **What it does:** Pulls in your Google Calendar, lets you manage tasks, uses OpenAI to suggest the best time to schedule them, and keeps you accountable with a focus timer + post-session check-in system.

---

## Quick Start

### 1. Clone & install

```bash
# Frontend dependencies
npm install

# Backend dependencies
cd backend && npm install && cd ..
```

### 2. Configure environment

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
# Google OAuth — create at console.cloud.google.com
# Enable: Google Calendar API
# Authorized redirect URI: http://localhost:5001/api/auth/google/callback
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5001/api/auth/google/callback

# OpenAI API key — get at platform.openai.com
OPENAI_API_KEY=your_openai_api_key

SESSION_SECRET=any-random-string-here
PORT=5001
```

### 3. Seed sample data (optional)

```bash
cd backend && node db/seed.js
```

### 4. Start both servers

```bash
# Terminal 1 — backend (port 5001)
cd backend && npm run dev

# Terminal 2 — frontend (port 5173)
npm run dev
```

Open http://localhost:5173

---

## Setting Up Google Calendar Integration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable **Google Calendar API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client IDs**
5. Application type: **Web application**
6. Add authorized redirect URI: `http://localhost:5001/api/auth/google/callback`
7. Copy the **Client ID** and **Client Secret** into `backend/.env`
8. In the app, go to **Settings** → **Connect Google Calendar**

---

## Features

### Execute View (`/execute`)
- Shows the next most important task (priority → due date → position)
- Integrated Pomodoro timer with session tracking
- Post-session accountability check-in with AI follow-up
- Quick task actions (Done, Skip, Schedule, In Progress)

### Tasks (`/tasks`)
- Full task CRUD with: title, description, priority, difficulty, duration, due date, tags
- Filter by status and priority, sort by position/priority/due date
- Drag-to-reorder
- "Add to Calendar" → AI suggests 2-3 slots → one-click scheduling

### Calendar (`/calendar`)
- Custom day/week view calendar (no external library)
- Syncs events from Google Calendar
- Visual distinction: Google events (gray) vs scheduled task blocks (indigo) vs completed (green)
- Current time indicator

### Daily Planning (`/plan`)
- Morning: write priorities → AI generates a realistic daily schedule
- Evening: AI review of what got done and what to move tomorrow

### Analytics (`/analytics`)
- Last 7 days: tasks completed, focus sessions, total focus time
- Daily bar charts for focus minutes and task completions
- Check-in outcome breakdown (finished / partial / blocked / skipped)

### Settings (`/settings`)
- Google Calendar OAuth connect/disconnect
- Setup instructions for API credentials

---

## Architecture

```
focus-exec/
├── src/                    # React 19 + Vite frontend
│   ├── pages/              # Route-level page components
│   ├── components/         # Reusable UI components
│   │   ├── layout/         # Sidebar, TopBar
│   │   ├── tasks/          # TaskRow, TaskModal, AddToCalendarModal
│   │   ├── calendar/       # DayView, WeekView, CalendarEvent
│   │   ├── execute/        # NextUpCard, ExecutionPomodoro, CheckInModal
│   │   ├── planning/       # AIPlanDisplay
│   │   └── shared/         # Modal, Button, Badge, Toast, Spinner
│   ├── hooks/              # State and API hooks
│   ├── utils/              # dateHelpers, calendarLayout, apiClient
│   └── constants/          # Enums and color config
│
├── backend/
│   ├── server.js           # Express entry point
│   ├── routes/             # tasks, calendar, auth, ai, sessions, checkins, dailylog, analytics
│   ├── services/           # googleCalendar.js, openai.js
│   └── db/
│       ├── database.js     # SQLite schema + migration
│       └── seed.js         # Sample data
```

**Stack:** React 19, Vite, Tailwind v4, React Router v6, Express, better-sqlite3, googleapis, openai

---

## AI Features

All AI features require `OPENAI_API_KEY`. They use `gpt-4o`.

| Feature | Endpoint | What it does |
|---------|----------|-------------|
| Slot suggestions | `POST /api/ai/suggest-slots` | 2-3 best times to schedule a task |
| Day planning | `POST /api/ai/schedule-day` | Full schedule for the day |
| Check-in response | `POST /api/ai/checkin-response` | Accountability follow-up |
| Evening review | `POST /api/ai/evening-review` | End-of-day summary |

AI features degrade gracefully — the app works without an API key, AI buttons just won't return results.

---

## Node version

Use Node 22: `nvm use 22`
