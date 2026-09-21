import type { NextRequest } from "next/server";
import { listReceipts } from "@/lib/orders/server";

const DEVICE_ID = /^[a-z0-9-]{8,64}$/i;

/** GET /api/orders?stadium=arena&device=<uuid> — history for one install, secrets included. */
export async function GET(request: NextRequest) {
  const stadium = request.nextUrl.searchParams.get("stadium");
  const device = request.nextUrl.searchParams.get("device");
  if (!stadium || !device || !DEVICE_ID.test(device)) {
    return Response.json({ error: "bad-request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const receipts = await listReceipts(stadium, device);
    return Response.json({ receipts }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("orders list failed", e);
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
