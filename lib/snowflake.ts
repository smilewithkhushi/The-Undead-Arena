import snowflake from "snowflake-sdk";
import type { GameEvent } from "@/lib/types";

let connection: snowflake.Connection | null = null;

function isConfigured(): boolean {
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
  if (!isConfigured()) {
    return null;
  }

  if (connection) {
    return connection;
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

  connection = created;
  return connection;
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

export async function writeEventsToSnowflake(events: GameEvent[]): Promise<void> {
  if (!events.length) {
    return;
  }

  const conn = await getConnection();
  if (!conn) {
    return;
  }

  const sqlText = `
    INSERT INTO game_events (event_id, session_id, timestamp, event_type, level, data)
    SELECT ?, ?, TO_TIMESTAMP_NTZ(? / 1000), ?, ?, PARSE_JSON(?)
  `;

  for (const event of events) {
    await executeStatement(conn, sqlText, [
      event.event_id,
      event.session_id,
      event.timestamp,
      event.event_type,
      event.level,
      JSON.stringify(event.data)
    ]);
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
