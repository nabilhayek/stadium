"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { withDb } from "@/lib/db";
import type { Receipt } from "@/lib/orders/receipt";
import { publicReceipt, toReceipt } from "@/lib/orders/shape";
import { kitchenSession } from "./session";
import { DEFAULT_PREP_MINUTES, MAX_DECLINE_REASON, toDbStatus, type KitchenChange } from "./board";

type Result = { ok: true } | { ok: false; error: string };

const MAX_PREP_MINUTES = 120;

/** Applies a desk decision to the receipt document. Returns null when the change is invalid. */
function applyChange(receipt: Receipt, change: KitchenChange, now: number): Receipt | null {
  switch (change.to) {
    case "new":
      return { ...receipt, kitchenStatus: "new" };
    case "accepted": {
      let readyAt = receipt.readyAt;
      if (change.prepMinutes !== undefined) {
        const prep = Math.floor(change.prepMinutes);
        if (!Number.isFinite(prep) || prep < 1 || prep > MAX_PREP_MINUTES) return null;
        readyAt = now + prep * 60_000;
      } else if (readyAt <= now) {
        // Dragged in without picking a time and the old ETA has passed: give the kitchen the default.
        readyAt = now + DEFAULT_PREP_MINUTES * 60_000;
      }
      return { ...receipt, kitchenStatus: "accepted", readyAt };
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

export async function updateKitchenOrder(
  stadiumSlug: string,
  orderNumber: string,
  change: KitchenChange,
): Promise<Result> {
  const session = await kitchenSession();
  if (!session) return { ok: false, error: "Sign in required." };

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

  revalidatePath(`/${stadiumSlug}/management`);
  revalidatePath(`/${stadiumSlug}/management/orders`);
  return { ok: true };
}
