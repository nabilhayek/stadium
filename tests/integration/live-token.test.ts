import "../support/server-mocks";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/live/kitchen/[stadium]/route";
import { notifyOrder } from "@/lib/live/hub";
import { kitchenStreamToken } from "@/lib/live/token";

const params = (stadium: string) => ({ params: Promise.resolve({ stadium }) });

function request(stadium: string, token: string | null, signal?: AbortSignal) {
  const url = new URL(`http://localhost/api/live/kitchen/${stadium}`);
  if (token !== null) url.searchParams.set("t", token);
  return new Request(url, { signal });
}

/** Reads from an SSE body until `done(text)` is true or the deadline passes. */
async function readUntil(body: ReadableStream<Uint8Array>, done: (text: string) => boolean, ms: number, tick?: () => Promise<void>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + ms;
  while (Date.now() < deadline && !done(text)) {
    const chunk = await Promise.race([reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 250))]);
    if (chunk && !chunk.done) text += decoder.decode(chunk.value);
    if (chunk?.done) break;
    if (!done(text)) await tick?.();
  }
  reader.releaseLock();
  return text;
}

describe("GET /api/live/kitchen/[stadium]", () => {
  it("returns 401 when the token is missing", async () => {
    const res = await GET(request("arena", null), params("arena"));
    expect(res.status).toBe(401);
    await expect(res.text()).resolves.toBe("unauthorized");
  });

  it("returns 401 for a garbage, tampered, wrong-stadium or expired token", async () => {
    const good = await kitchenStreamToken("arena", "user-1");

    expect((await GET(request("arena", "bad"), params("arena"))).status).toBe(401);
    expect(
      (
        await GET(
          request(
            "arena",
            good.replace(/.$/, (c) => (c === "A" ? "B" : "A")),
          ),
          params("arena"),
        )
      ).status,
    ).toBe(401);
    // A token for one stadium does not open another stadium's stream.
    expect((await GET(request("other", good), params("other"))).status).toBe(401);
    // Minted for 1970: its window ended long ago.
    const expired = await kitchenStreamToken("arena", "user-1", 0);
    expect((await GET(request("arena", expired), params("arena"))).status).toBe(401);
  });

  it("returns an event stream for a valid token and ends when the client aborts", async () => {
    const token = await kitchenStreamToken("arena", "user-1");
    const abort = new AbortController();

    const res = await GET(request("arena", token, abort.signal), params("arena"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-cache");
    const text = await readUntil(res.body!, (t) => t.includes("retry: 3000"), 5_000);
    expect(text).toContain("retry: 3000");

    abort.abort();
  });

  it("pushes an order event for its own stadium to an open stream", async () => {
    const token = await kitchenStreamToken("arena", "user-1");
    const abort = new AbortController();
    await notifyOrder("arena", "A-WARM"); // marks the hub as recently active so it connects right away

    const res = await GET(request("arena", token, abort.signal), params("arena"));
    expect(res.status).toBe(200);

    // The LISTEN connection is established asynchronously, so keep notifying until one lands.
    const text = await readUntil(
      res.body!,
      (t) => t.includes("event: order") && t.includes("A-LIVE"),
      15_000,
      () => notifyOrder("arena", "A-LIVE"),
    );
    abort.abort();

    expect(text).toContain("event: order");
    expect(text).toContain('"orderNumber":"A-LIVE"');
  }, 30_000);
});
