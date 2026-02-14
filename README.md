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
- If Snowflake env is missing or read fails, analytics route falls back to in-memory event store.

### Files
- `/Users/khushipanwar/Documents/TheUndeadArena/lib/snowflake.ts`
- `/Users/khushipanwar/Documents/TheUndeadArena/app/api/events/route.ts`
- `/Users/khushipanwar/Documents/TheUndeadArena/app/api/analytics/summary/route.ts`
- `/Users/khushipanwar/Documents/TheUndeadArena/sql/snowflake_setup.sql`
- `/Users/khushipanwar/Documents/TheUndeadArena/.env.example`

## Manual Setup You Need To Do

### 1) Create Snowflake objects
- Open Snowflake Worksheet.
- Run:
  - `/Users/khushipanwar/Documents/TheUndeadArena/sql/snowflake_setup.sql`

### 2) Create local env file
- Copy `.env.example` to `.env.local`.
- Fill values:
  - `SNOWFLAKE_ACCOUNT`
  - `SNOWFLAKE_USERNAME`
  - `SNOWFLAKE_PASSWORD`
  - `SNOWFLAKE_WAREHOUSE`
  - `SNOWFLAKE_DATABASE`
  - `SNOWFLAKE_SCHEMA`
  - `SNOWFLAKE_ROLE` (optional)

### 3) Grant role permissions (if needed)
Your Snowflake role should have usage + DML rights on warehouse/database/schema/table.

### 4) Restart app
After updating `.env.local`:

```bash
npm run dev
```

### 5) Verify writes
In Snowflake worksheet:

```sql
SELECT COUNT(*) FROM UNDEAD_ARENA_DB.GAME.game_events;
SELECT *
FROM UNDEAD_ARENA_DB.GAME.game_events
ORDER BY timestamp DESC
LIMIT 20;
```

## Notes
- Events are sent in 5-second batches; critical events are sent immediately.
- Failed sends are buffered in browser localStorage and retried.
- Session filtering for "My Session" works through `session_id` in the analytics API.
