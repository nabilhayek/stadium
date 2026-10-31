import { orderHub } from "@/lib/live/hub";
import { sseResponse } from "@/lib/live/sse";
import { readVersion } from "@/lib/live/version";
import { isOrderNumber } from "@/lib/orders/receipt";
import { getReceipt } from "@/lib/orders/server";

export const maxDuration = 300;

const MAX_ORDERS = 5;

/**
 * The public copy of the fan's live orders: on connect, then on every change.
 * Same exposure as `orders.get`, which anyone holding the order number can call.
 * A reconnect that has already seen the latest change skips the database, so an
 * open order page doesn't keep a sleeping database awake.
 */
export async function GET(request: Request, { params }: { params: Promise<{ stadium: string }> }) {
  const { stadium } = await params;
  const wanted = new Set(
    new URL(request.url).searchParams
      .getAll("o")
      .map((o) => o.toUpperCase())
      .filter(isOrderNumber)
      .slice(0, MAX_ORDERS),
  );
  if (wanted.size === 0) return new Response("no orders", { status: 400 });
  const lastSeen = request.headers.get("last-event-id");
  const version = await readVersion();

  return sseResponse(request.signal, 280_000, async (send, mark) => {
    const push = async (orderNumber: string) => {
      const receipt = await getReceipt(stadium, orderNumber).catch(() => null);
      if (receipt) send("receipt", receipt);
    };
    const pushAll = () => Promise.all([...wanted].map(push));
    const unsubscribe = orderHub().subscribe((event) => {
      if (event.kind === "resync") return void pushAll().then(() => mark(event.version));
      if (event.stadium === stadium && wanted.has(event.orderNumber)) void push(event.orderNumber).then(() => mark(event.version));
      else mark(event.version);
    });
    if (!lastSeen || (version !== null && version !== lastSeen)) await pushAll();
    mark(version ?? lastSeen ?? "0");
    return unsubscribe;
  });
}
