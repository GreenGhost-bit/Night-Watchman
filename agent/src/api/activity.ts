import { randomUUID } from "node:crypto";

/** Mirrors frontend/lib/types.ts's ActivityEvent shape exactly. */
export type ActivityEventType =
  | "no_action"
  | "defense_executed"
  | "policy_updated"
  | "price_crash"
  | "warning"
  | "info";

export interface ActivityEvent {
  id: string;
  timestamp: number;
  type: ActivityEventType;
  message: string;
  protocol?: string;
  account?: string;
  txHash?: string;
  riskRatio?: number;
}

export type NewActivityEvent = Omit<ActivityEvent, "id" | "timestamp">;

const MAX_EVENTS = 200;
const buffer: ActivityEvent[] = [];
const subscribers = new Set<(event: ActivityEvent) => void>();

/** Records a new event, trims the buffer, and pushes it to every live WS subscriber. */
export function logActivity(event: NewActivityEvent): ActivityEvent {
  const full: ActivityEvent = { id: randomUUID(), timestamp: Date.now(), ...event };
  buffer.push(full);
  if (buffer.length > MAX_EVENTS) buffer.shift();
  for (const notify of subscribers) notify(full);
  return full;
}

export function getRecentActivity(): ActivityEvent[] {
  // Newest first, matching the frontend's expected sort order for the log view.
  return [...buffer].reverse();
}

export function subscribeToActivity(callback: (event: ActivityEvent) => void): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}
