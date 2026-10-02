/**
 * Kitchen desk vocabulary shared by the server queries, the server action and
 * the board UI. No DB or browser imports here.
 */

import type { KitchenStatus } from "@/lib/orders/receipt";

/** Statuses that show as columns. Done and declined orders have left the board. */
export type BoardStatus = "new" | "accepted" | "ready";

export const BOARD_COLUMNS: { id: BoardStatus; label: string }[] = [
  { id: "new", label: "New" },
  { id: "accepted", label: "In progress" },
  { id: "ready", label: "Ready" },
];

export const STATUS_LABELS: Record<KitchenStatus, string> = {
  new: "New",
  accepted: "In progress",
  ready: "Ready",
  done: "Completed",
  declined: "Declined",
};

/** Prep times the desk can pick when accepting, in minutes. */
export const PREP_MINUTES = [5, 10, 20] as const;
export const DEFAULT_PREP_MINUTES = 10;

/** A new order that has waited this long is flagged on the board. */
export const ACCEPT_WINDOW_MS = 3 * 60_000;

/** Reasons the customer sees when the kitchen declines. */
export const DECLINE_REASONS = [
  { id: "missing-items", label: "Missing items", text: "Some items in the order are out of stock." },
  { id: "too-busy", label: "Too busy", text: "The kitchen can't take more orders right now." },
  { id: "closing-soon", label: "Closing soon", text: "The kitchen is closing and can't finish this order in time." },
  { id: "other", label: "Other", text: "" },
] as const;

export const MAX_DECLINE_REASON = 200;

export function isBoardStatus(status: string): status is BoardStatus {
  return status === "new" || status === "accepted" || status === "ready";
}

const TO_DB = {
  new: "NEW",
  accepted: "ACCEPTED",
  ready: "READY",
  done: "DONE",
  declined: "DECLINED",
} as const;

export function toDbStatus(status: KitchenStatus) {
  return TO_DB[status];
}

export function fromDbStatus(status: string): KitchenStatus {
  const lower = status.toLowerCase();
  if (lower === "accepted" || lower === "ready" || lower === "done" || lower === "declined") return lower;
  return "new";
}

export type DeskLine = { qty: number; name: string; note?: string };

export type DeskOrder = {
  orderNumber: string;
  status: BoardStatus;
  paidAt: number;
  /** Kitchen-owned ETA. Moves when the desk picks a prep time. */
  readyAt: number;
  scheduledAt: number | null;
  totalCents: number;
  currency: string;
  fulfillment: "delivery" | "pickup";
  seat: string | null;
  confirmCode: string;
  runnerNote: string;
  lines: DeskLine[];
};

/** What the desk can do to an order. Mirrors the buttons on a card. */
export type KitchenChange =
  | { to: "new" }
  | { to: "accepted"; prepMinutes?: number }
  | { to: "ready" }
  | { to: "done" }
  | { to: "declined"; reason: string };
