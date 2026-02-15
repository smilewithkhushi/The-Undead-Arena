"use client";

import { v4 as uuidv4 } from "uuid";
import { CRITICAL_EVENT_TYPES } from "@/lib/game-config";
import type { GameEvent, GameEventType } from "@/lib/types";

export const SESSION_STORAGE_KEY = "pvza_session_id";
const BACKUP_STORAGE_KEY = "pvza_pending_events";

const FLUSH_INTERVAL_MS = 2000;
const RETRY_BASE_MS = 1500;
const RETRY_MAX_MS = 30000;
const MAX_QUEUE_EVENTS = 1500;
const EVENT_BATCH_SIZE = 250;

export function getStoredSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(SESSION_STORAGE_KEY);
}

function getSessionId(): string {
  if (typeof window === "undefined") {
    return "server";
  }
  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const created = uuidv4();
  window.localStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
}

function cappedMergeFront(current: GameEvent[], incoming: GameEvent[]): GameEvent[] {
  const merged = [...incoming, ...current];
  if (merged.length <= MAX_QUEUE_EVENTS) {
    return merged;
  }
  return merged.slice(0, MAX_QUEUE_EVENTS);
}

function cappedPush(queue: GameEvent[], event: GameEvent): GameEvent[] {
  const next = [...queue, event];
  if (next.length <= MAX_QUEUE_EVENTS) {
    return next;
  }
  // Keep newest events when capacity is exceeded.
  return next.slice(next.length - MAX_QUEUE_EVENTS);
}

export class EventClient {
  private queue: GameEvent[] = [];
  private readonly sessionId = getSessionId();
  private timerId: number | null = null;
  private retryTimerId: number | null = null;
  private consecutiveFailures = 0;
  private flushInFlight = false;

  start(): void {
    const backup = window.localStorage.getItem(BACKUP_STORAGE_KEY);
    if (backup) {
      try {
        const parsed = JSON.parse(backup) as GameEvent[];
        this.queue = cappedMergeFront(this.queue, parsed);
      } catch {
        window.localStorage.removeItem(BACKUP_STORAGE_KEY);
      }
    }

    this.timerId = window.setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);

    window.addEventListener("beforeunload", this.flushSync);
  }

  stop(): void {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.retryTimerId) {
      window.clearTimeout(this.retryTimerId);
      this.retryTimerId = null;
    }
    window.removeEventListener("beforeunload", this.flushSync);
    this.persistBackup();
  }

  track(level: number, eventType: GameEventType, data: Record<string, unknown>): void {
    const event: GameEvent = {
      event_id: uuidv4(),
      session_id: this.sessionId,
      timestamp: Date.now(),
      event_type: eventType,
      level,
      data
    };

    this.queue = cappedPush(this.queue, event);
    this.persistBackup();

    if (CRITICAL_EVENT_TYPES.has(eventType)) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.queue.length || this.flushInFlight) {
      return;
    }

    this.flushInFlight = true;

    try {
      while (this.queue.length) {
        const payload = this.queue.slice(0, EVENT_BATCH_SIZE);
        this.queue = this.queue.slice(payload.length);
        this.persistBackup();

        try {
          const res = await fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ events: payload })
          });

          if (!res.ok) {
            throw new Error(`Failed with status ${res.status}`);
          }
        } catch {
          this.queue = cappedMergeFront(this.queue, payload);
          this.persistBackup();
          this.consecutiveFailures += 1;
          this.scheduleRetry();
          return;
        }
      }

      this.consecutiveFailures = 0;
      if (this.retryTimerId) {
        window.clearTimeout(this.retryTimerId);
        this.retryTimerId = null;
      }
    } finally {
      this.flushInFlight = false;
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimerId) {
      return;
    }

    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, this.consecutiveFailures - 1));
    this.retryTimerId = window.setTimeout(() => {
      this.retryTimerId = null;
      void this.flush();
    }, delay);
  }

  private flushSync = (): void => {
    if (!this.queue.length) {
      return;
    }
    const payload = JSON.stringify({ events: this.queue });
    navigator.sendBeacon("/api/events", payload);
    this.queue = [];
    this.persistBackup();
  };

  private persistBackup(): void {
    if (typeof window === "undefined") {
      return;
    }

    if (!this.queue.length) {
      window.localStorage.removeItem(BACKUP_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(this.queue));
  }
}
