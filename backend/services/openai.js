// services/openai.js — OpenAI wrapper for scheduling, planning, and accountability

const OpenAI = require("openai");

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set in environment");
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

async function callOpenAI(systemPrompt, userPrompt) {
  const response = await getClient().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  return response.choices[0].message.content;
}

function extractJSON(text) {
  const cleaned = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  return JSON.parse(cleaned);
}

async function suggestSlots({ task, freeSlots }) {
  const system = "You are a productivity scheduling assistant. Suggest the best time slots for focused work sessions. Bias toward: harder/higher-priority tasks earlier in the day, avoiding back-to-back blocks without buffer. Be direct and brief.";

  const slotsText = freeSlots.map((slot) =>
    `- ${formatTime(slot.start)} to ${formatTime(slot.end)} (${slot.duration_mins} min free)`
  ).join("\n");

  const user = `Schedule this task: "${task.title}"
- Estimated: ${task.estimated_mins ?? 30} minutes
- Priority: ${task.priority ?? "Medium"}
- Difficulty: ${task.difficulty ?? "Easy"}
${task.description ? `- Description: ${task.description}` : ""}

Available time slots today:
${slotsText || "No free slots found"}

Suggest the 2-3 best time slots. Return ONLY valid JSON (no markdown, no commentary):
{
  "suggestions": [
    {
      "start_time": "ISO datetime string",
      "end_time": "ISO datetime string",
      "reason": "brief 1-sentence reason"
    }
  ]
}`;

  return extractJSON(await callOpenAI(system, user));
}

async function generateDayPlan({ date, tasks, events, morningNote = "" }) {
  const system = "You are a productivity scheduling assistant creating a realistic daily plan. Keep it executable, not aspirational. Prioritize Urgent and High priority tasks. Leave buffer time between blocks. Respect existing calendar events.";

  const tasksText = tasks.length
    ? tasks.map((task) =>
        `- [${task.priority}/${task.difficulty}] "${task.title}" (~${task.estimated_mins ?? 30} min)`
      ).join("\n")
    : "No pending tasks";

  const eventsText = events.length
    ? events.map((event) =>
        `- ${formatTime(event.start_time)}–${formatTime(event.end_time)}: ${event.title}`
      ).join("\n")
    : "No calendar events today";

  const user = `Today is ${date}.
${morningNote ? `Morning note: "${morningNote}"` : ""}

PENDING TASKS:
${tasksText}

EXISTING CALENDAR EVENTS (cannot move):
${eventsText}

Create a realistic schedule for today. Return ONLY valid JSON:
{
  "schedule": [
    {
      "task_id": "string or null",
      "title": "string",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "type": "task | break | buffer",
      "notes": "brief rationale"
    }
  ],
  "summary": "2-3 sentence overview of the plan"
}`;

  return extractJSON(await callOpenAI(system, user));
}

async function generateCheckinResponse({ taskTitle, outcome, notes = "" }) {
  const system = "You are a supportive but direct productivity coach. Respond to focus session check-ins with 2-3 sentences. Be action-oriented. If blocked: suggest one concrete unblocking step. If skipped: non-judgmental redirect. If partial: affirm progress and clarify what's left. No filler or fluff.";

  const outcomeDescriptions = {
    finished: "marked as FINISHED",
    partial: "marked as PARTIAL PROGRESS",
    blocked: "marked as BLOCKED",
    skipped: "SKIPPED the session",
  };

  const user = `Task: "${taskTitle}"
Outcome: ${outcomeDescriptions[outcome] ?? outcome}
${notes ? `User note: "${notes}"` : ""}

Write a brief, direct response (2-3 sentences max).`;

  return callOpenAI(system, user);
}

async function recoverMissedBlock({ task, block, options }) {
  const system = "You are a concise execution coach embedded inside a task app. A user missed a scheduled work block. Recommend the best recovery mode without deciding the exact scheduling mechanics yourself. Be direct, calm, and action-oriented. Return ONLY valid JSON.";

  const user = `Task: "${task.title}"
Priority: ${task.priority ?? "Medium"}
Difficulty: ${task.difficulty ?? "Easy"}
Estimated duration: ${task.estimated_mins ?? 30} minutes
Missed block: ${block.start_time} to ${block.end_time}

Available deterministic recovery options:
- sprint_now: Start a 10-minute sprint immediately
- move_today: ${options.move_next_open_slot ? `Move to ${options.move_next_open_slot.start_time} – ${options.move_next_open_slot.end_time}` : "No fitting slot later today"}

Choose one recommended mode. Return ONLY valid JSON:
{
  "message": "short recommendation text for the card",
  "recommended_mode": "sprint_now | move_today",
  "reason": "short reason",
  "card_text": "optional compact wording for the UI"
}`;

  return extractJSON(await callOpenAI(system, user));
}

async function organizeCalendar({ date, tasks, existingEvents, freeSlots, strategy, allowSplit, workStart, workEnd }) {
  const strategyInstructions = {
    priority: "Order tasks by priority: Urgent → High → Medium → Low. Within same priority, schedule shorter tasks first.",
    shortest_first: "Order tasks by estimated duration, shortest first. This maximizes the number of tasks completed.",
    hardest_first: "Schedule high-difficulty and high-priority tasks in the morning (before noon) when cognitive energy is highest. Schedule easier, lower-priority tasks in the afternoon.",
    manual_order: "Schedule tasks in the exact order provided (already sorted by user's manual list order). Do not reorder.",
    ai_decide: "You decide the optimal order. Consider: priority, difficulty, estimated duration, time of day (hard tasks earlier), and available slot sizes. Explain your reasoning in the summary.",
  };

  const instruction = strategyInstructions[strategy] ?? strategyInstructions.priority;
  const tasksText = tasks.map((task, index) =>
    `${index + 1}. id="${task.id}" "${task.title}" — ${((task.estimated_mins ?? 30) / 60).toFixed(1)}h, priority=${task.priority}, difficulty=${task.difficulty}`
  ).join("\n");

  const eventsText = existingEvents.length
    ? existingEvents.map((event) => `  - ${formatTime(event.start_time)}–${formatTime(event.end_time)}: "${event.title}" (BLOCKED, cannot move)`).join("\n")
    : "  None";

  const slotsText = freeSlots.map((slot) =>
    `  - ${formatTime(slot.start)} to ${formatTime(slot.end)} (${slot.duration_mins} min free)`
  ).join("\n");

  const splitInstruction = allowSplit
    ? "Tasks CAN be split across multiple time blocks if a single slot isn't large enough."
    : "Do NOT split tasks. Each task must fit in a single contiguous time block. If a task doesn't fit in any slot, mark it unscheduled.";

  const system = `You are a calendar scheduling assistant. Schedule tasks into available time slots for a single day. ${instruction} ${splitInstruction} Work hours: ${workStart}–${workEnd}. Return ONLY valid JSON.`;

  const user = `Date: ${date}

TASKS TO SCHEDULE:
${tasksText || "No tasks"}

EXISTING CALENDAR EVENTS (immovable):
${eventsText}

AVAILABLE FREE SLOTS:
${slotsText || "  No free slots"}

Schedule the tasks. For split tasks, use the same task_id with different start/end times. Return ONLY valid JSON:
{
  "blocks": [
    {
      "task_id": "string",
      "title": "string",
      "start_time": "ISO datetime string",
      "end_time": "ISO datetime string",
      "split_part": null
    }
  ],
  "unscheduled": [
    { "task_id": "string", "title": "string", "reason": "why it didn't fit" }
  ],
  "summary": "2-3 sentence overview of how the day was organized and any tradeoffs made"
}`;

  return extractJSON(await callOpenAI(system, user));
}

async function generateTaskBreakdown({ taskTitle, notes = "", context = "" }) {
  const system = "You turn a task into 3 to 5 concrete execution steps. Every step must be action-oriented, specific, and small enough to start immediately. Avoid vague advice. Return ONLY valid JSON.";

  const user = `Task: "${taskTitle}"
${notes ? `Notes: ${notes}` : ""}
${context ? `Context: ${context}` : ""}

Return ONLY valid JSON:
{
  "steps": ["step 1", "step 2", "step 3"]
}`;

  return extractJSON(await callOpenAI(system, user));
}

async function generateTaskNextStep({ taskTitle, notes = "", context = "", recentState = {} }) {
  const system = "You choose exactly one small executable next action for a task. It must be concrete, specific, and phrased as something the user can do now. Return ONLY valid JSON.";

  const user = `Task: "${taskTitle}"
${notes ? `Notes: ${notes}` : ""}
${context ? `Context: ${context}` : ""}
Recent state: ${JSON.stringify(recentState)}

Return ONLY valid JSON:
{
  "next_step": "exactly one small executable action"
}`;

  return extractJSON(await callOpenAI(system, user));
}

async function generateSprintGoal({ taskTitle, notes = "", context = "", recentState = {} }) {
  const system = "You write exactly one sentence describing the goal for the next focus sprint. It should be concrete, narrow, and achievable within a single sprint. Return ONLY valid JSON.";

  const user = `Task: "${taskTitle}"
${notes ? `Notes: ${notes}` : ""}
${context ? `Context: ${context}` : ""}
Recent state: ${JSON.stringify(recentState)}

Return ONLY valid JSON:
{
  "goal": "one sentence sprint goal"
}`;

  return extractJSON(await callOpenAI(system, user));
}

async function generateEveningReview({ date, sessions, checkins, completedCount }) {
  const system = "You are a productivity coach writing a brief end-of-day review. Be honest, specific, and constructive. Acknowledge real wins, identify one pattern, suggest one thing for tomorrow. 3-4 sentences max. No generic platitudes.";

  const totalFocusMins = sessions.reduce((sum, session) => sum + (session.actual_mins ?? session.planned_mins ?? 0), 0);
  const outcomeSummary = checkins.map((checkin) => checkin.outcome).filter(Boolean).join(", ") || "none";

  const user = `Date: ${date}
Tasks completed: ${completedCount}
Focus sessions: ${sessions.length} (${totalFocusMins} total minutes)
Session outcomes: ${outcomeSummary}
${sessions.filter((session) => session.notes).map((session) => `Note: "${session.notes}"`).join("\n") || ""}

Write a brief end-of-day review (3-4 sentences).`;

  return callOpenAI(system, user);
}

function formatTime(isoStr) {
  if (!isoStr) return "unknown";

  try {
    return new Date(isoStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoStr;
  }
}

module.exports = {
  recoverMissedBlock,
  suggestSlots,
  generateDayPlan,
  generateCheckinResponse,
  generateTaskBreakdown,
  generateTaskNextStep,
  generateSprintGoal,
  generateEveningReview,
  organizeCalendar,
};
