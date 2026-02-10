"use client";

import { v4 as uuidv4 } from "uuid";
import { CRITICAL_EVENT_TYPES } from "@/lib/game-config";
import type { GameEvent, GameEventType } from "@/lib/types";

export const SESSION_STORAGE_KEY = "pvza_session_id";
const BACKUP_STORAGE_KEY = "pvza_pending_events";

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

export class EventClient {
  private queue: GameEvent[] = [];
  private readonly sessionId = getSessionId();
  private timerId: number | null = null;

  start(): void {
    const backup = window.localStorage.getItem(BACKUP_STORAGE_KEY);
    if (backup) {
      try {
        const parsed = JSON.parse(backup) as GameEvent[];
        this.queue.push(...parsed);
      } catch {
        window.localStorage.removeItem(BACKUP_STORAGE_KEY);
      }
    }

    this.timerId = window.setInterval(() => {
      void this.flush();
    }, 5000);

    window.addEventListener("beforeunload", this.flushSync);
  }

  stop(): void {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
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

    this.queue.push(event);
    this.persistBackup();

    if (CRITICAL_EVENT_TYPES.has(eventType)) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.queue.length) {
      return;
    }

    const payload = [...this.queue];
    this.queue = [];
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
      this.queue.unshift(...payload);
      this.persistBackup();
    }
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
