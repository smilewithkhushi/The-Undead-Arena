import { NextResponse } from "next/server";
import { appendEvents } from "@/lib/event-store";
import { writeEventsToSnowflake } from "@/lib/snowflake";
import type { GameEvent } from "@/lib/types";

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_EVENTS_PER_BATCH = 500;

function isGameEventArray(input: unknown): input is GameEvent[] {
  return Array.isArray(input) && input.every((e) => typeof e === "object" && e !== null && "event_id" in e);
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();

    if (raw.length > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const parsed = JSON.parse(raw) as { events?: unknown };

    if (!isGameEventArray(parsed.events)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (parsed.events.length > MAX_EVENTS_PER_BATCH) {
      return NextResponse.json({ error: "Too many events in one batch" }, { status: 413 });
    }

    appendEvents(parsed.events);

    try {
      await writeEventsToSnowflake(parsed.events);
    } catch (err) {
      console.error("Snowflake write failed:", err instanceof Error ? err.message : "Unknown error");
    }

    return NextResponse.json({ ok: true, accepted: parsed.events.length });
  } catch (err) {
    console.error("Events route error:", err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Failed to process events" }, { status: 500 });
  }
}
