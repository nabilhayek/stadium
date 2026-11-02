import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ withDb: vi.fn() }));

const { deliver, pushTopic } = await import("./send");

const target = (id: string) => ({ id, endpoint: `https://push.example.com/${id}`, p256dh: "key", auth: "auth" });
const message = { title: "Order A-K7M2 is ready", body: "Pick it up.", url: "/arena/order/A-K7M2", tag: "order-A-K7M2" };

describe("deliver", () => {
  it("sends the payload as JSON with the options", async () => {
    const transport = vi.fn().mockResolvedValue(undefined);
    await deliver([target("a")], message, { ttl: 600, urgency: "high", topic: "order-A-K7M2" }, transport);
    expect(transport).toHaveBeenCalledWith(target("a"), JSON.stringify(message), { ttl: 600, urgency: "high", topic: "order-A-K7M2" });
  });

  it("returns the subscriptions the push service no longer knows and keeps the rest", async () => {
    const transport = vi.fn(async (t: { id: string }) => {
      if (t.id === "gone") throw Object.assign(new Error("Gone"), { statusCode: 410 });
      if (t.id === "missing") throw Object.assign(new Error("Not found"), { statusCode: 404 });
      if (t.id === "flaky") throw Object.assign(new Error("Server error"), { statusCode: 500 });
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const gone = await deliver([target("ok"), target("gone"), target("missing"), target("flaky")], message, { ttl: 60, urgency: "normal" }, transport);
    expect(gone.sort()).toEqual(["gone", "missing"]);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});

describe("pushTopic", () => {
  it("keeps topics to 32 URL-safe characters", () => {
    expect(pushTopic("order-A-K7M2")).toBe("order-A-K7M2");
    expect(pushTopic("order A/K7M2")).toBe("order-A-K7M2");
    expect(pushTopic("x".repeat(40))).toHaveLength(32);
  });
});
