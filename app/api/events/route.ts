import { NextResponse } from "next/server";
import { appendEvents } from "@/lib/event-store";
import { writeEventsToSnowflake } from "@/lib/snowflake";
import type { GameEvent } from "@/lib/types";

function isGameEventArray(input: unknown): input is GameEvent[] {
  return Array.isArray(input) && input.every((e) => typeof e === "object" && e !== null && "event_id" in e);
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const parsed = JSON.parse(raw) as { events?: unknown };

    if (!isGameEventArray(parsed.events)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
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
