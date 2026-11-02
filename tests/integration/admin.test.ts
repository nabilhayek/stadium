import "../support/server-mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { takeSentEmails } from "@/lib/email/send";
import { writeAudit } from "@/lib/management/audit";
import { withDb } from "@/lib/db";
import { makeConfirmCode, makeOrderNumber, makeReceiptToken } from "@/lib/orders/receipt";
import { clearKitchenSession, kitchenCaller, makeSession, publicCaller } from "../support/caller";
import { createKitchenUser } from "../support/factories";

let deskCaller: ReturnType<typeof kitchenCaller> | null = null;

beforeEach(() => {
  clearKitchenSession();
  deskCaller = null;
});
afterEach(() => clearKitchenSession());

async function desk() {
  const { user } = await createKitchenUser();
  deskCaller = kitchenCaller(makeSession(user.id, user.email));
  return deskCaller;
}

async function restoreArena() {
  if (!deskCaller) return;
  const current = await deskCaller.admin.get({ stadium: "arena" });
  if (!current) return;
  await deskCaller.admin.save({
    stadium: "arena",
    settings: { ...current, currency: "EUR", members: [], ordering: { ...current.ordering, acceptOrders: true } },
  });
}

describe("admin auth", () => {
  it("requires a kitchen session", async () => {
    const caller = publicCaller();
    await expect(caller.admin.get({ stadium: "arena" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.admin.save({ stadium: "arena", settings: {} })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("admin get and save", () => {
  afterEach(restoreArena);

  it("loads defaults for a venue with no saved settings", async () => {
    const settings = await (await desk()).admin.get({ stadium: "arena" });
    expect(settings).not.toBeNull();
    expect(settings!.currency).toBe("EUR");
    expect(settings!.members).toEqual([]);
    expect(settings!.roles.map((role) => role.id)).toEqual(expect.arrayContaining(["admin", "manager", "kitchen", "runner"]));
    expect(settings!.kitchens.length).toBeGreaterThan(0);
  });

  it("returns null for an unknown stadium", async () => {
    const caller = await desk();
    await expect(caller.admin.get({ stadium: "nowhere" })).resolves.toBeNull();
    await expect(caller.admin.save({ stadium: "nowhere", settings: {} })).resolves.toEqual({ ok: false, error: "Stadium not found." });
  });

  it("saves the team and a pause, then the shop and checkout both see the pause", async () => {
    const caller = await desk();
    const current = await caller.admin.get({ stadium: "arena" });
    expect(current).not.toBeNull();

    const saved = await caller.admin.save({
      stadium: "arena",
      settings: {
        ...current!,
        ordering: { ...current!.ordering, acceptOrders: false },
        members: [{ id: "m-ada", name: "Ada", email: "Ada@Example.com", role: "kitchen", permissions: null, kitchens: [], status: "invited", lastSeen: null }],
      },
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.settings.members).toEqual([expect.objectContaining({ email: "ada@example.com", status: "invited", role: "kitchen" })]);
    expect(takeSentEmails().some((message) => message.to === "ada@example.com" && message.subject.includes("kitchen"))).toBe(true);

    const again = await caller.admin.get({ stadium: "arena" });
    expect(again!.ordering.acceptOrders).toBe(false);
    expect(again!.members).toHaveLength(1);

    const menu = await publicCaller().stadium.menu({ slug: "arena" });
    expect(menu!.orderingOpen).toBe(false);

    const paused = await publicCaller().payments.prepare({
      stadiumSlug: "arena",
      orderNumber: makeOrderNumber(),
      deviceId: "device-test-001",
      token: makeReceiptToken(),
      confirmCode: makeConfirmCode(),
      fulfillment: "delivery",
      timing: "asap",
      scheduledAt: null,
      etaMin: 10,
      etaMax: 14,
      seat: { sectionCode: "N", sectionName: "North Stand", row: "1", number: "10" },
      lines: [],
    });
    expect(paused).toEqual({ ok: false, status: 409, message: "Ordering is paused at this stadium." });
  });

  it("updates the stadium currency and refuses a second person with the same email", async () => {
    const caller = await desk();
    const current = await caller.admin.get({ stadium: "arena" });
    const member = {
      id: "m-ada",
      name: "Ada",
      email: "ada@example.com",
      role: "admin",
      permissions: null,
      kitchens: ["nope"],
      status: "active" as const,
      lastSeen: null,
    };

    const currency = await caller.admin.save({ stadium: "arena", settings: { ...current!, currency: "sek", members: [member] } });
    expect(currency.ok).toBe(true);
    if (!currency.ok) return;
    expect(currency.settings.currency).toBe("SEK");
    expect(currency.settings.members[0].kitchens).toEqual([]);
    await expect(withDb((db) => db.stadium.findUniqueOrThrow({ where: { slug: "arena" }, select: { currency: true } }))).resolves.toEqual({ currency: "SEK" });

    const duplicate = await caller.admin.save({
      stadium: "arena",
      settings: {
        ...currency.settings,
        members: [currency.settings.members[0], { ...member, id: "m-ada-2" }],
      },
    });
    expect(duplicate).toEqual({ ok: false, error: "Two people have the same email." });
  });

  it("sends the invite email as soon as someone is invited", async () => {
    const caller = await desk();
    takeSentEmails();
    const invited = await caller.admin.invite({ stadium: "arena", name: "Nabil", email: "Nabil@Example.com", role: "kitchen", kitchens: [] });
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;
    expect(invited.member).toEqual(expect.objectContaining({ email: "nabil@example.com", status: "invited", role: "kitchen" }));

    const emails = takeSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0]).toEqual(expect.objectContaining({ to: "nabil@example.com" }));
    expect(emails[0].html).toContain("intent=invite");

    const again = await caller.admin.invite({ stadium: "arena", name: "Nabil", email: "nabil@example.com", role: "kitchen", kitchens: [] });
    expect(again).toEqual({ ok: false, error: "That email is already on the team." });
    expect(takeSentEmails()).toEqual([]);

    const current = await caller.admin.get({ stadium: "arena" });
    const saved = await caller.admin.save({ stadium: "arena", settings: current! });
    expect(saved.ok).toBe(true);
    expect(takeSentEmails()).toEqual([]);
  });

  it("lists an audit row after it is written", async () => {
    const caller = await desk();
    await writeAudit({ stadiumSlug: "arena", action: "order.accepted", orderNumber: "A-AUDIT", actor: { email: "desk@example.com" } });
    const listed = await caller.admin.audit({ stadium: "arena" });
    expect(listed).not.toBeNull();
    expect(listed!.rows).toEqual([expect.objectContaining({ action: "order.accepted", orderNumber: "A-AUDIT", actorEmail: "desk@example.com" })]);
    expect(listed!.actors).toContain("desk@example.com");
  });

  it("refuses to remove the Admin role", async () => {
    const caller = await desk();
    const current = await caller.admin.get({ stadium: "arena" });
    const saved = await caller.admin.save({
      stadium: "arena",
      settings: { ...current!, roles: current!.roles.filter((role) => role.id !== "admin") },
    });
    expect(saved).toEqual({ ok: false, error: "The built-in roles can't be removed." });
  });
});
