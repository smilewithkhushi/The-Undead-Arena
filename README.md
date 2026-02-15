# The Undead Arena

A Plants vs Zombies-inspired browser game built for the **Snowflake Buildathon 2026**. Defend your lane, generate gameplay events, and analyze player behavior in a live dashboard.

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Game Engine | HTML5 Canvas custom loop |
| Styling | Tailwind CSS v3 |
| Charts | Chart.js / react-chartjs-2 |
| Event Pipeline | Next.js API routes |
| Storage | Snowflake via `snowflake-sdk` |

## Local Run

```bash
npm install
npm run dev
```

Game: [http://localhost:3000](http://localhost:3000)  
Dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

## Snowflake Integration (Implemented)

### What is wired
- `POST /api/events` writes incoming event batches into Snowflake table `game_events`.
- `GET /api/analytics/summary` reads events from Snowflake for analytics.
- `GET /api/snowflake/health` checks connection + table access.
- Analytics fallback behavior:
  - default: falls back to in-memory events if Snowflake is unavailable
  - strict mode: set `STRICT_SNOWFLAKE_ANALYTICS=true` to fail with 503 instead of fallback

### Core files
- `/Users/khushipanwar/Documents/TheUndeadArena/lib/snowflake.ts`
- `/Users/khushipanwar/Documents/TheUndeadArena/app/api/events/route.ts`
- `/Users/khushipanwar/Documents/TheUndeadArena/app/api/analytics/summary/route.ts`
- `/Users/khushipanwar/Documents/TheUndeadArena/app/api/snowflake/health/route.ts`

## Manual Setup (You Do This)

### 1) Run Snowflake setup SQL in worksheet

```sql
CREATE WAREHOUSE IF NOT EXISTS UNDEAD_ARENA_WH
  WITH WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE;

CREATE DATABASE IF NOT EXISTS UNDEAD_ARENA_DB;
CREATE SCHEMA IF NOT EXISTS UNDEAD_ARENA_DB.GAME;

CREATE TABLE IF NOT EXISTS UNDEAD_ARENA_DB.GAME.game_events (
  event_id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  timestamp TIMESTAMP_NTZ NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  level INTEGER,
  data VARIANT
);
```

### 2) Add local env vars in `.env` (or `.env.local`)

```env
SNOWFLAKE_ACCOUNT=
SNOWFLAKE_USERNAME=
SNOWFLAKE_PASSWORD=
SNOWFLAKE_WAREHOUSE=UNDEAD_ARENA_WH
SNOWFLAKE_DATABASE=UNDEAD_ARENA_DB
SNOWFLAKE_SCHEMA=GAME
SNOWFLAKE_ROLE=
STRICT_SNOWFLAKE_ANALYTICS=false
```

### 3) Verify connection
- Open: `http://localhost:3000/api/snowflake/health`
- Expected healthy response includes `ok: true` and `eventCount`.

### 4) Verify writes
In Snowflake worksheet:

```sql
SELECT COUNT(*) FROM UNDEAD_ARENA_DB.GAME.game_events;
SELECT *
FROM UNDEAD_ARENA_DB.GAME.game_events
ORDER BY timestamp DESC
LIMIT 20;
```

## Notes
- SQL files are git-ignored in this repo (`*.sql`, `sql/`) per project requirement.
- Events are sent in 5-second batches; critical events are sent immediately.
- Failed sends are buffered in browser localStorage and retried.
- Session filtering for "My Session" uses `session_id` in analytics API.
