import { env } from "@/env";
import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      host: String(env.QUESTDB_HOST),
      port: Number(env.QUESTDB_PORT),
      user: String(env.QUESTDB_USER),
      password: String(env.QUESTDB_PASSWORD),
      database: String(env.QUESTDB_DATABASE),
      connectionTimeoutMillis: 5000,
      max: 10,
      idleTimeoutMillis: 30000,
    });

    // Handle pool errors
    pool.on("error", (err) => {
      console.error("[QuestDB Pool Error]", err);
    });
  }

  return pool;
}

/**
 * Execute a query against QuestDB
 * @param query SQL query string with $1, $2, etc. placeholders
 * @param params Array of parameter values
 * @returns Array of rows from the query result
 */
export async function executeQuery<T extends Record<string, unknown>>(
  query: string,
  params: (string | number | null | undefined)[] = [],
): Promise<T[]> {
  const pool = getPool();

  try {
    const result = await pool.query<T>(query, params);
    return result.rows;
  } catch (error) {
    console.error("[QuestDB Query Error]", error);
    throw error;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
