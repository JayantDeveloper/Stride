import test from "node:test";
import assert from "node:assert/strict";
async function signUp(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      Referer: "http://localhost:5173/",
    },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  const cookies = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

  return { response, json, cookies };
}

test("auth signup creates a session and scopes task reads to the signed-in user", async (t) => {
  const originalEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_URL: process.env.POSTGRES_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    FRONTEND_URL: process.env.FRONTEND_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  };

  process.env.DATABASE_URL = `pg-mem://stride-auth-${Date.now()}-${Math.random()}`;
  delete process.env.POSTGRES_URL;
  process.env.BETTER_AUTH_SECRET =
    "0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.BETTER_AUTH_URL = "http://127.0.0.1:5001";
  process.env.FRONTEND_URL = "http://localhost:5173";
  process.env.SESSION_SECRET = "legacy-session-secret";
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
  process.env.GOOGLE_REDIRECT_URI =
    "http://localhost:5001/api/auth/callback/google";

  const serverModule = await import("./server.mjs");
  const app = await serverModule.createApp();

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const anonymousTasks = await fetch(`${baseUrl}/api/tasks`);
  assert.equal(anonymousTasks.status, 401);

  const userOne = await signUp(baseUrl, {
    name: "User One",
    email: "user-one@example.com",
    password: "password1234",
  });
  assert.equal(userOne.response.status, 200);
  assert.ok(userOne.cookies.length > 0);

  const createTaskResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: userOne.cookies,
    },
    body: JSON.stringify({ title: "User One Task" }),
  });
  assert.equal(createTaskResponse.status, 201);

  const userTwo = await signUp(baseUrl, {
    name: "User Two",
    email: "user-two@example.com",
    password: "password1234",
  });
  assert.equal(userTwo.response.status, 200);
  assert.ok(userTwo.cookies.length > 0);

  const userOneTasksResponse = await fetch(`${baseUrl}/api/tasks`, {
    headers: { Cookie: userOne.cookies },
  });
  const userOneTasks = await userOneTasksResponse.json();
  assert.equal(userOneTasksResponse.status, 200);
  assert.equal(userOneTasks.tasks.length, 1);
  assert.equal(userOneTasks.tasks[0].title, "User One Task");

  const userTwoTasksResponse = await fetch(`${baseUrl}/api/tasks`, {
    headers: { Cookie: userTwo.cookies },
  });
  const userTwoTasks = await userTwoTasksResponse.json();
  assert.equal(userTwoTasksResponse.status, 200);
  assert.deepEqual(userTwoTasks.tasks, []);
});
