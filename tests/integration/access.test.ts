import "../support/server-mocks";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { withDb } from "@/lib/db";
import { makeOrderNumber } from "@/lib/orders/receipt";
import { clearKitchenSession, kitchenCaller, makeSession } from "../support/caller";
import { getArena } from "../support/factories";

/** Desk authorization: the venue guard (team of this venue) and the permission guard (what the role allows). */

const created = { users: [] as string[], staff: [] as string[], stadiums: [] as string[] };

beforeEach(() => clearKitchenSession());
afterEach(() => clearKitchenSession());

afterAll(async () => {
  await withDb(async (db) => {
    await db.staffMember.deleteMany({ where: { id: { in: created.staff } } });
    await db.user.deleteMany({ where: { id: { in: created.users } } });
    await db.stadium.deleteMany({ where: { id: { in: created.stadiums } } });
  });
});

type StaffOptions = { stadiumId?: string; status?: "ACTIVE" | "INVITED" | "DISABLED"; permissions?: string[] };

/** A person who is not the owner, on the team of a venue (arena unless given) with `role`. */
async function staff(role: string | null, opts: StaffOptions = {}) {
  const id = randomUUID();
  const email = `access-${id}@example.com`;
  const stadiumId = opts.stadiumId ?? (await getArena()).id;
  // Admins and Managers must have two-factor on before any desk call; give everyone an authenticator here.
  await withDb((db) => db.user.create({ data: { id, name: "Access Test", email, emailVerified: true, twoFactorEnabled: true } }));
  created.users.push(id);
  let staffId: string | null = null;
  if (role) {
    staffId = randomUUID().slice(0, 24);
    await withDb((db) =>
      db.staffMember.create({
        data: {
          id: staffId!,
          stadiumId,
          email,
          name: "Access Test",
          roleId: role,
          status: opts.status ?? "ACTIVE",
          permissions: opts.permissions ?? undefined,
        },
      }),
    );
    created.staff.push(staffId);
  }
  const session = makeSession(id, email, { owner: false });
  session.user.twoFactorEnabled = true;
  return { caller: kitchenCaller(session), staffId, email };
}

const ARENA = { stadium: "arena" } as const;

describe("venue guard", () => {
  it("keeps out a signed-in account that isn't on the venue's team", async () => {
    const { caller } = await staff(null);
    await expect(caller.products.list(ARENA)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.kitchen.board(ARENA)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.admin.get(ARENA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps an admin of another venue out of this one", async () => {
    const other = await withDb((db) => db.stadium.create({ data: { slug: `access-${Date.now()}`, name: "Other Venue" } }));
    created.stadiums.push(other.id);
    const { caller } = await staff("admin", { stadiumId: other.id });
    await expect(caller.products.list({ stadium: other.slug })).resolves.not.toBeNull();
    await expect(caller.products.list(ARENA)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.admin.save({ stadium: "arena", settings: {} })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps out a disabled team member", async () => {
    const { caller } = await staff("kitchen", { status: "DISABLED" });
    await expect(caller.kitchen.board(ARENA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets an invited member in and marks them active", async () => {
    const { caller, staffId } = await staff("runner", { status: "INVITED" });
    await expect(caller.kitchen.board(ARENA)).resolves.toBeDefined();
    const row = await withDb((db) => db.staffMember.findUniqueOrThrow({ where: { id: staffId! } }));
    expect(row.status).toBe("ACTIVE");
  });
});

describe("permission guard", () => {
  it("a runner sees the board but can't edit the menu, refund, or open admin", async () => {
    const { caller } = await staff("runner");
    await expect(caller.kitchen.board(ARENA)).resolves.toBeDefined();
    await expect(caller.products.list(ARENA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.kitchen.refund({ stadium: "arena", orderNumber: makeOrderNumber() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.get(ARENA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.seatMap.get(ARENA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a runner may hand orders over but not accept them", async () => {
    const { caller } = await staff("runner");
    // Unknown order number: getting past the guard is what's tested, so a "not found" result means allowed.
    await expect(caller.kitchen.update({ stadium: "arena", orderNumber: makeOrderNumber(), change: { to: "done" } })).resolves.toBeDefined();
    await expect(caller.kitchen.update({ stadium: "arena", orderNumber: makeOrderNumber(), change: { to: "accepted" } })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("a kitchen member edits the menu", async () => {
    const { caller } = await staff("kitchen");
    await expect(caller.products.list(ARENA)).resolves.not.toBeNull();
  });

  it("a personal permission list overrides the role", async () => {
    const { caller } = await staff("kitchen", { permissions: ["orders.view"] });
    await expect(caller.kitchen.board(ARENA)).resolves.toBeDefined();
    await expect(caller.products.list(ARENA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin saves are checked against what they change", () => {
  async function arenaSettings() {
    const owner = kitchenCaller(makeSession(randomUUID(), "owner@example.com"));
    return (await owner.admin.get(ARENA))!;
  }

  it("a manager may pause a kitchen but not change ordering or the team", async () => {
    const before = await arenaSettings();
    const { caller } = await staff("manager");
    const current = (await caller.admin.get(ARENA))!;
    expect(current).not.toBeNull();

    const paused = { ...current, kitchens: current.kitchens.map((k, i) => (i === 0 ? { ...k, open: !k.open } : k)) };
    await expect(caller.admin.save({ stadium: "arena", settings: paused })).resolves.toMatchObject({ ok: true });

    const reread = (await caller.admin.get(ARENA))!;
    const ordering = { ...reread, ordering: { ...reread.ordering, tips: !reread.ordering.tips } };
    await expect(caller.admin.save({ stadium: "arena", settings: ordering })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // This manager is on the team list, so renaming everyone is a team change.
    const team = { ...reread, members: reread.members.map((m) => ({ ...m, name: `${m.name}!` })) };
    await expect(caller.admin.save({ stadium: "arena", settings: team })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Put the kitchen back the way it was.
    const restore = (await caller.admin.get(ARENA))!;
    await caller.admin.save({ stadium: "arena", settings: { ...restore, kitchens: before.kitchens } });
  });

  it("someone who manages the team but isn't an admin can't make anyone an admin", async () => {
    const { caller } = await staff("manager", { permissions: ["team.manage"] });
    await expect(
      caller.admin.invite({ stadium: "arena", name: "New Admin", email: `new-${Date.now()}@example.com`, role: "admin", kitchens: [] }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const current = (await caller.admin.get(ARENA))!;
    const promoted = { ...current, members: current.members.map((m) => (m.email.startsWith("access-") ? { ...m, role: "admin" } : m)) };
    await expect(caller.admin.save({ stadium: "arena", settings: promoted })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
