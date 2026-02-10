# Laser Garden Arena

Event-driven mini game prototype for Snowflake Buildathon 2026.

## Stack
- Next.js 14 (App Router) + TypeScript
- Canvas-based game loop
- API routes for event ingestion
- Optional Snowflake direct writes via `snowflake-sdk`
- Dashboard charts via Chart.js

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Optional: configure Snowflake in `.env.local`:
   ```bash
   SNOWFLAKE_ACCOUNT=
   SNOWFLAKE_USERNAME=
   SNOWFLAKE_PASSWORD=
   SNOWFLAKE_WAREHOUSE=
   SNOWFLAKE_DATABASE=
   SNOWFLAKE_SCHEMA=
   SNOWFLAKE_ROLE=
   ```
3. Run locally:
   ```bash
   npm run dev
   ```
4. Open:
   - Game: `http://localhost:3000`
   - Dashboard: `http://localhost:3000/dashboard`

## Current MVP
- 3 playable levels
- Laser multiplier and permanent destruction
- Event queue with 5s batching + critical event immediate flush
- `/api/events` ingestion route
- `/api/analytics/summary` dashboard aggregation

## Snowflake Table
```sql
CREATE TABLE game_events (
  event_id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  timestamp TIMESTAMP_NTZ NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  level INTEGER,
  data VARIANT
);
```
