import en from "../../../messages/en.json";
import sv from "../../../messages/sv.json";
import da from "../../../messages/da.json";
import { isLocale, type Locale } from "@/i18n/config";
import { fill } from "@/lib/email/copy";
import { formatCents } from "@/lib/money";
import type { Receipt } from "@/lib/orders/receipt";

const catalogs = { en, sv, da } as const;

export type PushCopy = (typeof en)["push"];

export function pushCopy(locale: Locale): PushCopy {
  return catalogs[locale].push;
}

export type PushText = { title: string; body: string };

/** What the fan sees when the kitchen moves their order. Null for states that don't warrant a notification. */
export function fanText(receipt: Receipt, locale: string): PushText | null {
  const copy = pushCopy(isLocale(locale) ? locale : "en");
  const vars = { order: receipt.orderNumber, code: receipt.confirmCode, reason: receipt.declineReason ?? "" };
  const pick = (() => {
    switch (receipt.kitchenStatus) {
      case "accepted":
        return copy.accepted;
      case "ready":
        return receipt.fulfillment === "delivery" ? copy.readyDelivery : copy.readyPickup;
      case "done":
        return copy.done;
      case "declined":
        return copy.declined;
      default:
        return null;
    }
  })();
  if (!pick) return null;
  return { title: fill(pick.title, vars, "text"), body: fill(pick.body, vars, "text").trim() };
}

/** What the desk sees for a new paid order. */
export function deskText(receipt: Receipt, locale: string): PushText {
  const copy = pushCopy(isLocale(locale) ? locale : "en");
  const count = receipt.lines.reduce((sum, line) => sum + line.qty, 0);
  const items = count === 1 ? copy.itemOne : fill(copy.itemMany, { count: String(count) }, "text");
  const total = formatCents(receipt.totalCents ?? 0, receipt.currency ?? "EUR");
  return {
    title: fill(copy.deskNew.title, { order: receipt.orderNumber }, "text"),
    body: fill(copy.deskNew.body, { items, total }, "text"),
  };
}
