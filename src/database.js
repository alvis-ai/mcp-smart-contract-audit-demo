import { Pool } from "pg";

const connectionString = process.env.AUDIT_DATABASE_URL || process.env.DATABASE_URL || "";
const sslMode = String(process.env.AUDIT_DATABASE_SSL || process.env.DATABASE_SSL || "").toLowerCase();
const poolMax = Math.max(1, Number(process.env.AUDIT_DATABASE_POOL_MAX || 10));

let pool;

function resolveSsl() {
  if (!sslMode || sslMode === "disable" || sslMode === "false") {
    return undefined;
  }

  if (sslMode === "verify-full") {
    return {
      rejectUnauthorized: true
    };
  }

  return {
    rejectUnauthorized: false
  };
}

export function getStorageDriver() {
  return connectionString ? "postgres" : "local";
}

export function isPostgresEnabled() {
  return getStorageDriver() === "postgres";
}

export function getDatabaseUrl() {
  return connectionString;
}

export function getPgPool() {
  if (!connectionString) {
    throw new Error("AUDIT_DATABASE_URL or DATABASE_URL is required for PostgreSQL storage.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: poolMax,
      ssl: resolveSsl()
    });

    pool.on("error", (error) => {
      process.stderr.write(`[db] PostgreSQL pool error: ${error.message}\n`);
    });
  }

  return pool;
}

export async function withPgClient(callback) {
  const pgPool = getPgPool();
  const client = await pgPool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function closeDatabasePool() {
  if (!pool) {
    return;
  }
  const current = pool;
  pool = undefined;
  await current.end();
}
