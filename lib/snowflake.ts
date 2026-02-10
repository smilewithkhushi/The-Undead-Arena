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

export async function writeEventsToSnowflake(events: GameEvent[]): Promise<void> {
  if (!events.length) {
    return;
  }

  const conn = await getConnection();
  if (!conn) {
    return;
  }

  const values = events
    .map(
      (e) =>
        `('${e.event_id}','${e.session_id}',TO_TIMESTAMP_NTZ(${e.timestamp}/1000),'${e.event_type}',${e.level},PARSE_JSON('${JSON.stringify(
          e.data
        ).replace(/'/g, "''")}'))`
    )
    .join(",");

  const sqlText = `
    INSERT INTO game_events (event_id, session_id, timestamp, event_type, level, data)
    VALUES ${values}
  `;

  await new Promise<void>((resolve, reject) => {
    conn.execute({
      sqlText,
      complete: (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    });
  });
}
