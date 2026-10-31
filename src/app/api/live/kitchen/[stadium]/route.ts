import { orderHub } from "@/lib/live/hub";
import { sseResponse } from "@/lib/live/sse";
import { verifyKitchenStreamToken } from "@/lib/live/token";
import { readVersion } from "@/lib/live/version";

export const maxDuration = 300;

/** Order numbers that changed at this stadium. The desk refetches the board itself. */
export async function GET(request: Request, { params }: { params: Promise<{ stadium: string }> }) {
  const { stadium } = await params;
  if (!(await verifyKitchenStreamToken(new URL(request.url).searchParams.get("t"), stadium))) return new Response("unauthorized", { status: 401 });
  const lastSeen = request.headers.get("last-event-id");
  const version = await readVersion();

  return sseResponse(request.signal, 280_000, (send, mark) => {
    const unsubscribe = orderHub().subscribe((event) => {
      if (event.kind === "resync") send("order", { orderNumber: null });
      else if (event.stadium === stadium) send("order", { orderNumber: event.orderNumber });
      mark(event.version);
    });
    // Something changed while this board was reconnecting.
    if (lastSeen && version !== null && version !== lastSeen) send("order", { orderNumber: null });
    mark(version ?? lastSeen ?? "0");
    return unsubscribe;
  });
}
