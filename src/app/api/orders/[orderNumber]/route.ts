import type { NextRequest } from "next/server";
import { isOrderNumber } from "@/lib/orders/receipt";
import { getReceipt, putReceipt } from "@/lib/orders/server";
import { toReceipt } from "@/lib/orders/shape";

type Ctx = { params: Promise<{ orderNumber: string }> };

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

/** GET /api/orders/A-K7M2?stadium=arena — the public copy of one receipt. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const { orderNumber } = await params;
  const stadium = request.nextUrl.searchParams.get("stadium");
  const number = decodeURIComponent(orderNumber).toUpperCase();
  if (!stadium || !isOrderNumber(number)) return json({ error: "bad-request" }, 400);

  try {
    const receipt = await getReceipt(stadium, number);
    if (!receipt) return json({ error: "not-found" }, 404);
    return json({ receipt });
  } catch (e) {
    console.error("orders GET failed", e);
    return json({ error: "unavailable" }, 503);
  }
}

/** PUT /api/orders/A-K7M2 — the phone pushes its receipt; body must carry the write token. */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const { orderNumber } = await params;
  const receipt = toReceipt(await request.json().catch(() => null));
  if (!receipt || receipt.orderNumber !== decodeURIComponent(orderNumber)) {
    return json({ error: "bad-request" }, 400);
  }

  try {
    const result = await putReceipt(receipt);
    if (result === "forbidden") return json({ error: "forbidden" }, 403);
    if (result === "no-stadium") return json({ error: "not-found" }, 404);
    return json({ ok: true, result }, result === "created" ? 201 : 200);
  } catch (e) {
    console.error("orders PUT failed", e);
    return json({ error: "unavailable" }, 503);
  }
}
