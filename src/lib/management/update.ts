import "server-only";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { withDb } from "@/lib/db";
import type { Receipt } from "@/lib/orders/receipt";
import { publicReceipt, toReceipt } from "@/lib/orders/shape";
import { refundOrder } from "@/lib/payments/service";
import { MAX_DECLINE_REASON, previewAccept, toDbStatus, type KitchenChange } from "./board";

type Result = { ok: true } | { ok: false; error: string };

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
export async function updateKitchenOrder(
  stadiumSlug: string,
  orderNumber: string,
  change: KitchenChange,
): Promise<Result> {
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
    return "ok" as const;
  });

  if (outcome === "missing") return { ok: false, error: "Order not found." };
  if (outcome === "corrupt") return { ok: false, error: "This order can't be read." };
  if (outcome === "invalid") return { ok: false, error: "That change isn't allowed." };
  if (typeof outcome === "string" && outcome !== "ok") return { ok: false, error: outcome };

  revalidatePath(`/${stadiumSlug}/management`);
  revalidatePath(`/${stadiumSlug}/management/orders`);
  return { ok: true };
}
