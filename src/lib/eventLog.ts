import { useSyncExternalStore } from "react";

/** A small in-memory log of real things that happened in the app: errors that
 * surfaced through the error reporter today, and later alerts, route pushes
 * and reconnects. Never invented: every entry comes from a real code path
 * calling logEvent. Kept outside React (a plain external store) so any code,
 * hooks or not, can write to it, and so a log panel can read it with
 * useEventLog without a provider.
 *
 * Capped, because it only needs to answer "what has gone wrong or changed
 * recently", not keep history across restarts. */

export type EventLevel = "info" | "warn" | "error";

export interface LogEvent {
  id: number;
  /** Epoch milliseconds. */
  at: number;
  level: EventLevel;
  /** Short subsystem tag shown beside the message, e.g. "SYS", "NAV". */
  source: string;
  message: string;
}

const MAX_EVENTS = 200;
const MAX_MESSAGE_LENGTH = 400;

let events: LogEvent[] = [];
let sequence = 0;
const listeners = new Set<() => void>();

export function logEvent(level: EventLevel, source: string, message: string): void {
  const entry: LogEvent = {
    id: ++sequence,
    at: Date.now(),
    level,
    source,
    message: message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}...` : message,
  };
  // A new array each time, so useSyncExternalStore sees a changed snapshot.
  events = [...events.slice(-(MAX_EVENTS - 1)), entry];
  listeners.forEach((listener) => listener());
}

export function clearEvents(): void {
  events = [];
  listeners.forEach((listener) => listener());
}

export function getEvents(): readonly LogEvent[] {
  return events;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useEventLog(): readonly LogEvent[] {
  return useSyncExternalStore(subscribe, getEvents);
}
