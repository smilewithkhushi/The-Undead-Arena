import snowflake from "snowflake-sdk";
import type { GameEvent } from "@/lib/types";

snowflake.configure({ logLevel: "WARN" });

const globalSnowflake = globalThis as typeof globalThis & {
  __snowflakeConnection?: snowflake.Connection;
};

export function isSnowflakeConfigured(): boolean {
  return Boolean(
    process.env.SNOWFLAKE_ACCOUNT &&
      process.env.SNOWFLAKE_USERNAME &&
      process.env.SNOWFLAKE_PASSWORD &&
      process.env.SNOWFLAKE_DATABASE &&
      process.env.SNOWFLAKE_SCHEMA &&
      process.env.SNOWFLAKE_WAREHOUSE
  );
}

async function getConnection(): Promise<snowflake.Connection | null> {
  if (!isSnowflakeConfigured()) {
    return null;
  }

  if (globalSnowflake.__snowflakeConnection) {
    return globalSnowflake.__snowflakeConnection;
  }

  const created = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT!,
    username: process.env.SNOWFLAKE_USERNAME!,
    password: process.env.SNOWFLAKE_PASSWORD!,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
    database: process.env.SNOWFLAKE_DATABASE!,
    schema: process.env.SNOWFLAKE_SCHEMA!,
    role: process.env.SNOWFLAKE_ROLE
  });

  await new Promise<void>((resolve, reject) => {
    created.connect((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

  globalSnowflake.__snowflakeConnection = created;
  return created;
}

async function executeStatement<T = unknown>(
  conn: snowflake.Connection,
  sqlText: string,
  binds?: snowflake.Bind[]
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve((rows ?? []) as T[]);
      }
    });
  });
}

const WRITE_BATCH_SIZE = 100;

export async function writeEventsToSnowflake(events: GameEvent[]): Promise<void> {
  if (!events.length) {
    return;
  }

  const conn = await getConnection();
  if (!conn) {
    return;
  }

  for (let i = 0; i < events.length; i += WRITE_BATCH_SIZE) {
    const batch = events.slice(i, i + WRITE_BATCH_SIZE);

    const valueRows = batch
      .map(() => "(?, ?, ?, ?, ?, ?)")
      .join(",\n");

    const sqlText = `
      INSERT INTO game_events (event_id, session_id, timestamp, event_type, level, data)
      SELECT
        column1::varchar,
        column2::varchar,
        column3::timestamp_ntz,
        column4::varchar,
        column5::integer,
        PARSE_JSON(column6)
      FROM VALUES
      ${valueRows}
    `;

    const binds: snowflake.Bind[] = [];
    for (const event of batch) {
      binds.push(
        event.event_id,
        event.session_id,
        new Date(event.timestamp).toISOString(),
        event.event_type,
        event.level,
        JSON.stringify(event.data)
      );
    }

    await executeStatement(conn, sqlText, binds);
  }
}

type SnowflakeEventRow = {
  EVENT_ID: string;
  SESSION_ID: string;
  TS_MS: number;
  EVENT_TYPE: string;
  LEVEL: number;
  DATA: unknown;
};

function parseRowData(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object") {
    return input as Record<string, unknown>;
  }

  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input) as Record<string, unknown>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

export async function readEventsFromSnowflake(sessionId: string | null): Promise<GameEvent[] | null> {
  const conn = await getConnection();
  if (!conn) {
    return null;
  }

  const hasSession = Boolean(sessionId);
  const sqlText = hasSession
    ? `
      SELECT
        event_id,
        session_id,
        DATE_PART(EPOCH_MILLISECOND, timestamp) AS ts_ms,
        event_type,
        level,
        data
      FROM game_events
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `
    : `
      SELECT
        event_id,
        session_id,
        DATE_PART(EPOCH_MILLISECOND, timestamp) AS ts_ms,
        event_type,
        level,
        data
      FROM game_events
      ORDER BY timestamp ASC
    `;

  const rows = await executeStatement<SnowflakeEventRow>(conn, sqlText, hasSession ? [sessionId] : undefined);

  return rows.map((row) => ({
    event_id: String(row.EVENT_ID),
    session_id: String(row.SESSION_ID),
    timestamp: Number(row.TS_MS),
    event_type: String(row.EVENT_TYPE) as GameEvent["event_type"],
    level: Number(row.LEVEL),
    data: parseRowData(row.DATA)
  }));
}

export async function findFirstSessionId(): Promise<string | null> {
  const conn = await getConnection();
  if (!conn) {
    return null;
  }

  const rows = await executeStatement<{ SESSION_ID: string }>(
    conn,
    `
    SELECT session_id
    FROM game_events
    WHERE event_type = 'level_started'
    ORDER BY timestamp ASC
    LIMIT 1
    `
  );

  return rows.length ? String(rows[0].SESSION_ID) : null;
}

type HealthRow = {
  EVENT_COUNT: number;
  DATABASE_NAME: string;
  SCHEMA_NAME: string;
  WAREHOUSE_NAME: string;
};

export type SnowflakeHealth = {
  configured: boolean;
  reachable: boolean;
  database?: string;
  schema?: string;
  warehouse?: string;
  eventCount?: number;
  error?: string;
};

export async function checkSnowflakeHealth(): Promise<SnowflakeHealth> {
  if (!isSnowflakeConfigured()) {
    return { configured: false, reachable: false };
  }

  try {
    const conn = await getConnection();
    if (!conn) {
      return { configured: true, reachable: false, error: "Connection unavailable" };
    }

    const rows = await executeStatement<HealthRow>(
      conn,
      `
      SELECT
        COUNT(*) AS event_count,
        CURRENT_DATABASE() AS database_name,
        CURRENT_SCHEMA() AS schema_name,
        CURRENT_WAREHOUSE() AS warehouse_name
      FROM game_events
      `
    );

    const first = rows[0];
    return {
      configured: true,
      reachable: true,
      database: String(first?.DATABASE_NAME ?? process.env.SNOWFLAKE_DATABASE ?? ""),
      schema: String(first?.SCHEMA_NAME ?? process.env.SNOWFLAKE_SCHEMA ?? ""),
      warehouse: String(first?.WAREHOUSE_NAME ?? process.env.SNOWFLAKE_WAREHOUSE ?? ""),
      eventCount: Number(first?.EVENT_COUNT ?? 0)
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
