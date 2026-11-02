import "../support/server-mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withDb } from "@/lib/db";
import { putReceipt } from "@/lib/orders/server";
import { takeSentPushes } from "@/lib/push/send";
import { createKitchenUser, makeReceiptFixture } from "../support/factories";
import { clearKitchenSession, kitchenCaller, makeSession, publicCaller } from "../support/caller";

let endpointCount = 0;
function browserSubscription() {
  endpointCount += 1;
  return {
    endpoint: `https://push.example.com/send/${Date.now()}-${endpointCount}`,
    keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
  };
}

async function paidReceipt(overrides?: Parameters<typeof makeReceiptFixture>[0]) {
  const receipt = makeReceiptFixture(overrides);
  expect(await putReceipt(receipt, { authoritative: true })).toBe("created");
  return receipt;
}

async function signedInDesk() {
  const { user } = await createKitchenUser();
  return kitchenCaller(makeSession(user.id, user.email));
}

beforeEach(() => {
  clearKitchenSession();
  takeSentPushes();
});

afterEach(() => {
  clearKitchenSession();
});

describe("following an order", () => {
  it("rejects a subscription without the order's token", async () => {
    const receipt = await paidReceipt();
    const result = await publicCaller().push.followOrder({
      stadium: "arena",
      orderNumber: receipt.orderNumber,
      token: "WRONGTOKENWRONGTOKEN1234",
      locale: "en",
      subscription: browserSubscription(),
    });
    expect(result).toEqual({ ok: false, error: "forbidden" });
    await expect(withDb((db) => db.pushSubscription.count())).resolves.toBe(0);
  });

  it("rejects an endpoint that isn't https", async () => {
    const receipt = await paidReceipt();
    await expect(
      publicCaller().push.followOrder({
        stadium: "arena",
        orderNumber: receipt.orderNumber,
        token: receipt.token!,
        locale: "en",
        subscription: { ...browserSubscription(), endpoint: "http://push.example.com/x" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("pushes a kitchen change only to the phones following that order, in their language", async () => {
    const followed = await paidReceipt({ fulfillment: "pickup" });
    const other = await paidReceipt();
    const mine = browserSubscription();
    const theirs = browserSubscription();
    await expect(
      publicCaller().push.followOrder({ stadium: "arena", orderNumber: followed.orderNumber, token: followed.token!, locale: "sv", subscription: mine }),
    ).resolves.toEqual({ ok: true });
    await publicCaller().push.followOrder({ stadium: "arena", orderNumber: other.orderNumber, token: other.token!, locale: "en", subscription: theirs });
    takeSentPushes();

    const desk = await signedInDesk();
    await desk.kitchen.update({ stadium: "arena", orderNumber: followed.orderNumber, change: { to: "ready" } });

    const sent = takeSentPushes();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      endpoint: mine.endpoint,
      message: {
        title: `Order ${followed.orderNumber} är klar`,
        body: `Hämta den i disken med koden ${followed.confirmCode}.`,
        url: `/arena/order/${followed.orderNumber}`,
        tag: `order-${followed.orderNumber}`,
      },
      options: { urgency: "high", topic: `order-${followed.orderNumber}` },
    });
  });

  it("sends nothing when the status didn't change or nobody follows", async () => {
    const receipt = await paidReceipt();
    const desk = await signedInDesk();
    await desk.kitchen.update({ stadium: "arena", orderNumber: receipt.orderNumber, change: { to: "accepted" } });
    expect(takeSentPushes()).toEqual([]);

    await publicCaller().push.followOrder({
      stadium: "arena",
      orderNumber: receipt.orderNumber,
      token: receipt.token!,
      locale: "en",
      subscription: browserSubscription(),
    });
    await desk.kitchen.update({ stadium: "arena", orderNumber: receipt.orderNumber, change: { to: "accepted" } });
    expect(takeSentPushes()).toEqual([]);
  });

  it("stops after unfollowing", async () => {
    const receipt = await paidReceipt();
    const sub = browserSubscription();
    await publicCaller().push.followOrder({ stadium: "arena", orderNumber: receipt.orderNumber, token: receipt.token!, locale: "en", subscription: sub });
    await publicCaller().push.unfollowOrder({ orderNumber: receipt.orderNumber, endpoint: sub.endpoint });

    const desk = await signedInDesk();
    await desk.kitchen.update({ stadium: "arena", orderNumber: receipt.orderNumber, change: { to: "done" } });
    expect(takeSentPushes()).toEqual([]);
  });
});

describe("desk alerts", () => {
  it("needs a kitchen session", async () => {
    await expect(publicCaller().push.followDesk({ stadium: "arena", locale: "en", subscription: browserSubscription() })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("pushes a new paid order to that stadium's desk devices only", async () => {
    const other = await withDb((db) => db.stadium.create({ data: { slug: "harbour", name: "Harbour Ground" } }));
    const desk = await signedInDesk();
    const here = browserSubscription();
    await expect(desk.push.followDesk({ stadium: "arena", locale: "en", subscription: here })).resolves.toEqual({ ok: true });
    await desk.push.followDesk({ stadium: other.slug, locale: "en", subscription: browserSubscription() });

    const receipt = await paidReceipt({
      totalCents: 1250,
      lines: [{ productId: "p1", name: "Cola 0.5L", qty: 2, unitCents: 625, options: [], note: "" }],
    });

    const sent = takeSentPushes();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      endpoint: here.endpoint,
      message: { title: `New order ${receipt.orderNumber}`, body: "2 items · €12.50", url: "/arena/management/orders" },
      options: { urgency: "high" },
    });
  });

  it("does not push again when the phone re-syncs an existing order", async () => {
    const desk = await signedInDesk();
    await desk.push.followDesk({ stadium: "arena", locale: "en", subscription: browserSubscription() });
    const receipt = await paidReceipt();
    takeSentPushes();

    expect(await putReceipt({ ...receipt, runnerNote: "Blue jacket" })).toBe("updated");
    expect(takeSentPushes()).toEqual([]);
  });
});

describe("one browser following desk and an order", () => {
  it("keeps both owners on the same endpoint and only drops the side that unfollowed", async () => {
    const receipt = await paidReceipt();
    const desk = await signedInDesk();
    const shared = browserSubscription();

    await expect(desk.push.followDesk({ stadium: "arena", locale: "en", subscription: shared })).resolves.toEqual({ ok: true });
    await expect(
      publicCaller().push.followOrder({ stadium: "arena", orderNumber: receipt.orderNumber, token: receipt.token!, locale: "sv", subscription: shared }),
    ).resolves.toEqual({ ok: true });

    await expect(withDb((db) => db.pushSubscription.findUniqueOrThrow({ where: { endpoint: shared.endpoint } }))).resolves.toMatchObject({
      orderNumber: receipt.orderNumber,
      userId: expect.any(String),
      locale: "sv",
    });

    await publicCaller().push.unfollowOrder({ orderNumber: receipt.orderNumber, endpoint: shared.endpoint });
    await expect(withDb((db) => db.pushSubscription.findUniqueOrThrow({ where: { endpoint: shared.endpoint } }))).resolves.toMatchObject({
      orderNumber: null,
      userId: expect.any(String),
    });

    takeSentPushes();
    await paidReceipt();
    expect(takeSentPushes()).toHaveLength(1);
  });
});

describe("renewing a subscription", () => {
  it("moves the row to the new endpoint when the old one is known", async () => {
    const receipt = await paidReceipt();
    const old = browserSubscription();
    await publicCaller().push.followOrder({ stadium: "arena", orderNumber: receipt.orderNumber, token: receipt.token!, locale: "en", subscription: old });

    const { POST } = await import("@/app/api/push/renew/route");
    const next = browserSubscription();
    const request = (oldEndpoint: string, subscription = next) =>
      new Request("http://localhost/api/push/renew", { method: "POST", body: JSON.stringify({ oldEndpoint, subscription }) });

    expect((await POST(request("https://push.example.com/unknown"))).status).toBe(404);
    expect((await POST(request(old.endpoint))).status).toBe(204);
    await expect(withDb((db) => db.pushSubscription.findUniqueOrThrow({ where: { endpoint: next.endpoint } }))).resolves.toMatchObject({
      orderNumber: receipt.orderNumber,
    });
  });

  it("replaces a stale row already sitting at the new endpoint", async () => {
    const receipt = await paidReceipt();
    const old = browserSubscription();
    const next = browserSubscription();
    await publicCaller().push.followOrder({ stadium: "arena", orderNumber: receipt.orderNumber, token: receipt.token!, locale: "en", subscription: old });
    await withDb(async (db) => {
      const stadium = await db.stadium.findUniqueOrThrow({ where: { slug: "arena" } });
      await db.pushSubscription.create({
        data: {
          endpoint: next.endpoint,
          p256dh: next.keys.p256dh,
          auth: next.keys.auth,
          locale: "en",
          stadiumId: stadium.id,
          orderNumber: "STALE-ROW",
        },
      });
    });

    const { POST } = await import("@/app/api/push/renew/route");
    const request = new Request("http://localhost/api/push/renew", {
      method: "POST",
      body: JSON.stringify({ oldEndpoint: old.endpoint, subscription: next }),
    });
    expect((await POST(request)).status).toBe(204);
    await expect(withDb((db) => db.pushSubscription.findUniqueOrThrow({ where: { endpoint: next.endpoint } }))).resolves.toMatchObject({
      orderNumber: receipt.orderNumber,
    });
    await expect(withDb((db) => db.pushSubscription.count({ where: { endpoint: old.endpoint } }))).resolves.toBe(0);
  });
});
