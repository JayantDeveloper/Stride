const { Pool } = require("pg");

function formatDateValue(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return match[1];
    }
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 10);
  }

  return [
    parsed.getUTCFullYear(),
    String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    String(parsed.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function applyDateModifier(value, modifier) {
  const base = formatDateValue(value);
  if (!base || !modifier) return base;

  const match = String(modifier).trim().match(/^([+-]\d+)\s+day$/i);
  if (!match) return base;

  const date = new Date(`${base}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(match[1]));
  return formatDateValue(date);
}

function registerPgMemFunctions(db, DataType) {
  const dateOverloads = [
    [DataType.text],
    [DataType.timestamp],
    [DataType.timestamptz],
    [DataType.date],
  ];

  for (const args of dateOverloads) {
    db.public.registerFunction({
      name: "date",
      args,
      returns: DataType.text,
      implementation: (value) => formatDateValue(value),
    });
  }

  db.public.registerFunction({
    name: "date",
    args: [DataType.text, DataType.text],
    returns: DataType.text,
    implementation: (value, modifier) => applyDateModifier(value, modifier),
  });
}

function createPoolFromConfig() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required");
  }

  if (connectionString.startsWith("pg-mem://")) {
    const { DataType, newDb } = require("pg-mem");
    const db = newDb({ autoCreateForeignKeyIndices: true });
    registerPgMemFunctions(db, DataType);
    const adapter = db.adapters.createPg();
    return {
      kind: "pg-mem",
      pool: new adapter.Pool(),
      db,
    };
  }

  const shouldUseSsl =
    process.env.PGSSLMODE === "require" ||
    process.env.DATABASE_SSL === "require" ||
    (process.env.NODE_ENV === "production" && !/localhost|127\.0\.0\.1/.test(connectionString));

  return {
    kind: "postgres",
    pool: new Pool({
      connectionString,
      ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
    }),
    db: null,
  };
}

function getSharedState() {
  if (!global.__focusExecPostgresState) {
    global.__focusExecPostgresState = createPoolFromConfig();
  }
  return global.__focusExecPostgresState;
}

function getPool() {
  return getSharedState().pool;
}

function getPgMemDb() {
  return getSharedState().db;
}

async function closePool() {
  if (!global.__focusExecPostgresState) return;
  await global.__focusExecPostgresState.pool.end();
  delete global.__focusExecPostgresState;
}

module.exports = {
  getPool,
  getPgMemDb,
  closePool,
};
