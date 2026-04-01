// seed.js — populate DB with sample tasks for local testing
// Run: node backend/db/seed.js

const db = require("./database");
const crypto = require("crypto");

const SEED_TASKS = [
  { title: "Design new onboarding flow", description: "Sketch wireframes and user journey for the revamped onboarding experience.", priority: "High", difficulty: "Hard", estimated_mins: 90, status: "Not Started", tags: ["design", "product"] },
  { title: "Fix auth token refresh bug", description: "Access tokens expire but refresh flow silently fails — investigate and fix.", priority: "Urgent", difficulty: "Medium", estimated_mins: 45, status: "In Progress", tags: ["backend", "auth"] },
  { title: "Write Q2 planning doc", description: "Summarize team goals, key results, and resource allocation for Q2.", priority: "High", difficulty: "Medium", estimated_mins: 60, status: "Not Started", tags: ["planning"] },
  { title: "Review open pull requests", description: "Go through 3 open PRs and leave thorough review comments.", priority: "Medium", difficulty: "Easy", estimated_mins: 30, status: "Not Started", tags: ["code-review"] },
  { title: "Update API documentation", description: "Document the new /api/schedule endpoints added last sprint.", priority: "Medium", difficulty: "Easy", estimated_mins: 45, status: "Not Started", tags: ["docs", "backend"] },
  { title: "Refactor database queries", description: "Move raw SQL strings in route handlers into a proper repository layer.", priority: "Low", difficulty: "Hard", estimated_mins: 120, status: "Not Started", tags: ["backend", "refactor"] },
  { title: "Set up error monitoring", description: "Integrate Sentry for frontend and backend error capture.", priority: "Medium", difficulty: "Medium", estimated_mins: 60, status: "Not Started", tags: ["devops"] },
  { title: "Prep for team sync", description: "Prepare agenda and update status on all current initiatives before Wednesday standup.", priority: "High", difficulty: "Easy", estimated_mins: 20, status: "Not Started", tags: ["meetings"] },
];

// Clear existing seed tasks to avoid duplication on re-run
db.prepare("DELETE FROM tasks").run();

const insert = db.prepare(`
  INSERT INTO tasks (id, title, description, status, priority, difficulty,
    estimated_mins, tags, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertAll = db.transaction((tasks) => {
  tasks.forEach((t, i) => {
    insert.run(
      crypto.randomUUID(),
      t.title,
      t.description,
      t.status,
      t.priority,
      t.difficulty,
      t.estimated_mins,
      JSON.stringify(t.tags),
      i + 1
    );
  });
});

insertAll(SEED_TASKS);
console.log(`Seeded ${SEED_TASKS.length} tasks.`);
