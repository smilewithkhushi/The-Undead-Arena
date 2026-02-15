# The Undead Arena

**A lane-based zombie defense game with real-time Snowflake-powered analytics.**

Built for the **Snowflake Buildathon** — The Undead Arena combines a fully playable, canvas-rendered arcade game with a production-grade telemetry pipeline that streams every gameplay event into Snowflake for live analysis.

> Play the game. Unlock shooter plants. Kill the zombies. Watch the data flow.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS |
| Game Engine | HTML5 Canvas |
| Visualization | Chart.js + react-chartjs-2 |
| API Layer | Next.js API Routes |
| Data Warehouse | **Snowflake** (`snowflake-sdk`) |

---

## Architecture

<p align="center">
  <img src="public/architecture.png" alt="Architecture Diagram" width="100%" />
</p>

1. The game loop emits structured events on every kill, level change, shield use, and game outcome.
2. Events are buffered client-side and batch-flushed every ~2 seconds (critical events flush immediately).
3. `/api/events` validates and writes event batches directly to Snowflake.
4. `/api/analytics/summary` queries Snowflake to compute real-time dashboard metrics.
5. `/dashboard` renders session-level and aggregate gameplay insights.

---

## Snowflake Integration

### Pipeline Design
Every gameplay action is captured as a structured event and persisted to Snowflake in near real time.

| Snowflake Object | Value |
|---|---|
| Warehouse | `UNDEAD_ARENA_WH` |
| Database | `UNDEAD_ARENA_DB` |
| Schema | `GAME` |
| Table | `game_events` |

### Event Schema

| Column | Type | Purpose |
|--------|------|---------|
| `event_id` | STRING | Unique event identifier |
| `session_id` | STRING | Groups events by play session |
| `timestamp` | TIMESTAMP | When the event occurred |
| `event_type` | STRING | Category: `kill`, `level_start`, `game_over`, etc. |
| `level` | INTEGER | Current game level |
| `data` | VARIANT | Flexible JSON payload (zombie type, score, HP, etc.) |

### Reliability Engineering
- **Batched writes** — reduces per-event Snowflake overhead
- **Queue cap** — prevents unbounded memory growth during intense gameplay
- **Exponential backoff** — retries transient write failures gracefully
- **Fallback-safe reads** — dashboard degrades cleanly if Snowflake is unreachable

---

## Gameplay

- Canvas-rendered arena with perspective lane field and progressive difficulty scaling
- **6 zombie archetypes** — each with distinct HP, speed, and visual design
- Wave-based levels with special burst-wave stages
- Shield system with cooldown mechanics for tactical decision-making
- Per-zombie health bars, hit feedback, and score accumulation across levels

---

## What Makes This Project Stand Out

**Most game projects stop at gameplay. We didn't.**

Every kill, every level, every game over is a data point — captured, batched, delivered, and queryable. The result is a game that's fun to play *and* a working demonstration of real-time event analytics on Snowflake.

- **End-to-end Snowflake integration** — not a mock, not a log dump. Structured writes and live reads.
- **Production-style event pipeline** — batching, retry, backoff, queue management, graceful degradation.
- **Playable-first design** — the game is genuinely engaging, not just a data demo.
- **Session-aware dashboard** — high-signal metrics computed directly from Snowflake queries.

---

## Quick Start

```bash
npm install
npm run dev
```

Create `.env.local`:
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

Validate connectivity at `/api/snowflake/health`, then play a session and view analytics at `/dashboard`.

---

## Demo


