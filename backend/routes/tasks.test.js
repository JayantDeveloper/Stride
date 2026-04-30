const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

test("POST /api/tasks defaults allow_split to 1 when the client omits it", async (t) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  process.env.DATABASE_URL = `pg-mem://stride-tasks-${Date.now()}-${Math.random()}`;
  delete process.env.POSTGRES_URL;
  delete require.cache[require.resolve("../db/postgres")];
  delete require.cache[require.resolve("../db/database")];
  delete require.cache[require.resolve("./tasks")];

  const { initializeSchema, dbGet } = require("../db/database");
  const tasksRouter = require("./tasks");

  await initializeSchema();

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: "test-user-id" };
    next();
  });
  app.use("/api/tasks", tasksRouter);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete require.cache[require.resolve("../db/postgres")];
    delete require.cache[require.resolve("../db/database")];
    delete require.cache[require.resolve("./tasks")];
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/tasks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Route-created task" }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.task.allow_split, 1);
  assert.equal(body.task.user_id, "test-user-id");

  const stored = await dbGet(
    "SELECT allow_split FROM tasks WHERE id = ? AND user_id = ?",
    [body.task.id, "test-user-id"],
  );
  assert.equal(stored.allow_split, 1);
});
