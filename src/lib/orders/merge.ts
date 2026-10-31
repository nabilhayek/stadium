import { recordPastOrder, readPastOrders } from "./past";
import { readReceipt, writeReceipt, type Receipt } from "./receipt";

/** The kitchen-owned fields of the server copy, applied to the local receipt. Null when nothing moved. */
export function mergeKitchen(local: Receipt, server: Receipt): Receipt | null {
  if (!server.kitchenStatus) return null;
  const same =
    server.kitchenStatus === local.kitchenStatus && server.readyAt === local.readyAt && (server.declineReason ?? null) === (local.declineReason ?? null);
  if (same) return null;
  const next: Receipt = { ...local, kitchenStatus: server.kitchenStatus, readyAt: server.readyAt };
  if (server.declineReason) next.declineReason = server.declineReason;
  return next;
}

/** Fold a server copy into the phone's live receipt and history. */
export function applyServerReceipt(server: Receipt) {
  const live = readReceipt(server.stadiumSlug);
  const local = live?.orderNumber === server.orderNumber ? live : readPastOrders(server.stadiumSlug).find((o) => o.orderNumber === server.orderNumber);
  if (!local) return;
  const next = mergeKitchen(local, server);
  if (!next) return;
  if (live?.orderNumber === server.orderNumber) writeReceipt(next);
  recordPastOrder(next);
}
