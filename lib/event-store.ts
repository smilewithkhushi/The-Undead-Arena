import type { GameEvent } from "@/lib/types";

declare global {
  // eslint-disable-next-line no-var
  var __eventStore: GameEvent[] | undefined;
}

const events = global.__eventStore ?? [];
if (!global.__eventStore) {
  global.__eventStore = events;
}

export function appendEvents(newEvents: GameEvent[]): void {
  events.push(...newEvents);
}

export function getEvents(): GameEvent[] {
  return events;
}
