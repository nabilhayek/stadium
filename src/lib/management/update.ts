import "server-only";
import { revalidateLocalized } from "@/lib/revalidate";
import type { Prisma } from "@/generated/prisma/client";
import { withDb } from "@/lib/db";
import { notifyOrder } from "@/lib/live/hub";
import type { Receipt } from "@/lib/orders/receipt";
import { publicReceipt, toReceipt } from "@/lib/orders/shape";
import { refundOrder } from "@/lib/payments/service";
import { later } from "@/lib/push/later";
import { sendOrderPush } from "@/lib/push/order";
import { writeAudit, type AuditActor } from "./audit";
import { MAX_DECLINE_REASON, previewAccept, toDbStatus, type KitchenChange } from "./board";

type Result = { ok: true } | { ok: false; error: string };

export type KitchenActor = AuditActor & {
  /** Override the audit action for system jobs (e.g. auto-refund). */
  action?: string;
};

/** Applies a desk decision to the receipt document. Returns null when the change is invalid. */
function applyChange(receipt: Receipt, change: KitchenChange, now: number): Receipt | null {
  switch (change.to) {
    case "new":
      return { ...receipt, kitchenStatus: "new" };
    case "accepted": {
      const clock = previewAccept(
        { readyAt: receipt.readyAt, scheduledAt: receipt.timing === "scheduled" ? receipt.scheduledAt : null },
        change.prepMinutes,
        now,
      );
      if (!clock) return null;
      return { ...receipt, kitchenStatus: "accepted", readyAt: clock.readyAt, acceptedAt: clock.acceptedAt };
    }
    case "ready":
      // Ready means ready — the customer's countdown should hit zero now.
      return { ...receipt, kitchenStatus: "ready", readyAt: Math.min(receipt.readyAt, now) };
    case "done":
      return { ...receipt, kitchenStatus: "done" };
    case "declined": {
      const reason = change.reason.trim();
      if (!reason || reason.length > MAX_DECLINE_REASON) return null;
      return { ...receipt, kitchenStatus: "declined", declineReason: reason };
    }
    default:
      return null;
  }
}

/** Callers must have checked the kitchen session; the tRPC kitchen procedure does. */
export async function updateKitchenOrder(stadiumSlug: string, orderNumber: string, change: KitchenChange, actor?: KitchenActor | null): Promise<Result> {
  let moved: Receipt | null = null;
  const outcome = await withDb(async (db) => {
    const row = await db.receipt.findFirst({
      where: { orderNumber, stadium: { slug: stadiumSlug } },
      select: { id: true, body: true },
    });
    if (!row) return "missing" as const;
    const receipt = toReceipt(row.body);
    if (!receipt) return "corrupt" as const;

    const next = applyChange(receipt, change, Date.now());
    if (!next) return "invalid" as const;

    if (change.to === "declined") {
      const refund = await refundOrder(stadiumSlug, orderNumber);
      if (!refund.ok) return refund.message;
    }

    await db.receipt.update({
      where: { id: row.id },
      data: {
        kitchenStatus: toDbStatus(next.kitchenStatus ?? "new"),
        readyAt: new Date(next.readyAt),
        body: publicReceipt(next) as unknown as Prisma.InputJsonValue,
      },
    });
    if (next.kitchenStatus !== receipt.kitchenStatus) moved = next;
    return "ok" as const;
  });

  if (outcome === "missing") return { ok: false, error: "Order not found." };
  if (outcome === "corrupt") return { ok: false, error: "This order can't be read." };
  if (outcome === "invalid") return { ok: false, error: "That change isn't allowed." };
  if (typeof outcome === "string" && outcome !== "ok") return { ok: false, error: outcome };

  if (change.to === "accepted") {
    await writeAudit({
      stadiumSlug,
      orderNumber,
      action: "order.accepted",
      actor,
      detail: { prepMinutes: change.prepMinutes ?? null },
    });
  }

  if (change.to === "declined") {
    await writeAudit({
      stadiumSlug,
      orderNumber,
      action: actor?.action ?? "order.declined",
      actor,
      detail: { reason: change.reason.trim() },
    });
  }

  revalidateLocalized(`/${stadiumSlug}/management`);
  revalidateLocalized(`/${stadiumSlug}/management/orders`);
  await notifyOrder(stadiumSlug, orderNumber);
  const pushed = moved as Receipt | null;
  if (pushed) await later(() => sendOrderPush(pushed));
  return { ok: true };
}

/**
 * Refund a finished (done) order from the overview. Keeps kitchen status as done
 * so the fan still sees a completed hand-off; the card is marked refunded on the payment.
 */
export async function refundFinishedOrder(stadiumSlug: string, orderNumber: string, actor: KitchenActor, reason?: string): Promise<Result> {
  const note = (reason ?? "Refunded from the desk.").trim().slice(0, MAX_DECLINE_REASON);
  const outcome = await withDb(async (db) => {
    const row = await db.receipt.findFirst({
      where: { orderNumber, stadium: { slug: stadiumSlug } },
      select: { id: true, body: true, kitchenStatus: true },
    });
    if (!row) return "missing" as const;
    if (row.kitchenStatus !== "DONE") return "not-finished" as const;
    const receipt = toReceipt(row.body);
    if (!receipt) return "corrupt" as const;

    const refund = await refundOrder(stadiumSlug, orderNumber);
    if (!refund.ok) return refund.message;

    const next: Receipt = { ...receipt, refundedAt: Date.now(), refundReason: note };
    await db.receipt.update({
      where: { id: row.id },
      data: { body: publicReceipt(next) as unknown as Prisma.InputJsonValue },
    });
    return "ok" as const;
  });

  if (outcome === "missing") return { ok: false, error: "Order not found." };
  if (outcome === "corrupt") return { ok: false, error: "This order can't be read." };
  if (outcome === "not-finished") return { ok: false, error: "Only completed orders can be refunded here. Decline it on the board instead." };
  if (typeof outcome === "string" && outcome !== "ok") return { ok: false, error: outcome };

  await writeAudit({
    stadiumSlug,
    orderNumber,
    action: "order.refunded",
    actor,
    detail: { reason: note },
  });

  revalidateLocalized(`/${stadiumSlug}/management`);
  revalidateLocalized(`/${stadiumSlug}/management/orders`);
  await notifyOrder(stadiumSlug, orderNumber);
  return { ok: true };
}
