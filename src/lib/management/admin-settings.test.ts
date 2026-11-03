import { describe, expect, it } from "vitest";
import { initialSettings } from "@/components/management/admin/model";
import { emptySeatMap } from "@/lib/seatmap/schema";
import type { AdminSettings, Member } from "@/components/management/admin/model";
import { adminChangePermissions, normalizeAdminSettings, readsAcceptOrders } from "./admin-settings";

function draft(overrides?: Record<string, unknown>) {
  return { ...initialSettings(emptySeatMap(), "EUR"), members: [], ...overrides };
}

describe("normalizeAdminSettings", () => {
  it("keeps a valid document and lowercases emails", () => {
    const result = normalizeAdminSettings(
      draft({
        members: [
          { id: "m1", name: "Ada", email: "Ada@Example.com", role: "kitchen", permissions: null, kitchens: [], status: "invited", lastSeen: "Yesterday" },
        ],
      }),
      "EUR",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.members[0]).toMatchObject({ email: "ada@example.com", lastSeen: null });
  });

  it("puts every permission back on Admin", () => {
    const base = draft();
    const result = normalizeAdminSettings(
      {
        ...base,
        roles: base.roles.map((role) => (role.id === "admin" ? { ...role, permissions: ["orders.view"] } : role)),
      },
      "EUR",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.roles.find((role) => role.id === "admin")?.permissions).toContain("settings.edit");
  });

  it("clears kitchens on an admin even when the id is unknown", () => {
    const result = normalizeAdminSettings(
      draft({
        members: [
          {
            id: "m1",
            name: "Ada",
            email: "ada@example.com",
            role: "admin",
            permissions: ["orders.view"],
            kitchens: ["nope"],
            status: "active",
            lastSeen: null,
          },
        ],
      }),
      "EUR",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.members[0]).toMatchObject({ permissions: null, kitchens: [] });
  });

  it("refuses to drop a built-in role", () => {
    const base = draft();
    const result = normalizeAdminSettings({ ...base, roles: base.roles.filter((role) => role.id !== "runner") }, "EUR");
    expect(result).toEqual({ ok: false, error: "The built-in roles can't be removed." });
  });
});

describe("readsAcceptOrders", () => {
  it("treats a missing document as open", () => {
    expect(readsAcceptOrders(null)).toBe(true);
    expect(readsAcceptOrders({})).toBe(true);
    expect(readsAcceptOrders({ ordering: { acceptOrders: false } })).toBe(false);
  });
});

describe("adminChangePermissions", () => {
  const ada: Member = { id: "m1", name: "Ada", email: "ada@example.com", role: "kitchen", permissions: null, kitchens: [], status: "active", lastSeen: null };
  const grill: AdminSettings["kitchens"][number] = {
    id: "k1",
    name: "Grill",
    x: 0,
    y: 0,
    open: true,
    pickup: true,
    delivery: true,
    capacity: 20,
    prepMinutes: 8,
    overflow: false,
    overflowTo: null,
    overflowAt: 80,
    autoPause: false,
  };

  function before(): AdminSettings {
    return { ...initialSettings(emptySeatMap(), "EUR"), kitchens: [grill], members: [ada] };
  }

  it("needs nothing when nothing changed, even with keys in another order and read-only fields", () => {
    const doc = before();
    const shuffled = Object.fromEntries(Object.entries(doc).reverse()) as AdminSettings;
    const after = { ...shuffled, members: [{ ...ada, lastSeen: "Yesterday", twoFactor: true }] };
    expect(adminChangePermissions(doc, after)).toEqual({ permissions: [], touchesAdmins: false });
  });

  it("opening or pausing a kitchen needs kitchens.pause only", () => {
    const doc = before();
    const after = { ...doc, kitchens: doc.kitchens.map((k, i) => (i === 0 ? { ...k, open: !k.open } : k)) };
    expect(adminChangePermissions(doc, after).permissions).toEqual(["kitchens.pause"]);
  });

  it("any other kitchen change needs settings.edit", () => {
    const doc = before();
    const after = { ...doc, kitchens: doc.kitchens.map((k, i) => (i === 0 ? { ...k, capacity: k.capacity + 1 } : k)) };
    expect(adminChangePermissions(doc, after).permissions).toEqual(["settings.edit"]);
  });

  it("ordering, payments and the like need settings.edit", () => {
    const doc = before();
    const after = { ...doc, ordering: { ...doc.ordering, tips: !doc.ordering.tips } };
    expect(adminChangePermissions(doc, after).permissions).toEqual(["settings.edit"]);
  });

  it("team and role changes need team.manage", () => {
    const doc = before();
    expect(adminChangePermissions(doc, { ...doc, members: [{ ...ada, kitchens: ["k1"] }] }).permissions).toEqual(["team.manage"]);
    expect(adminChangePermissions(doc, { ...doc, members: [] }).permissions).toEqual(["team.manage"]);
    const roles = doc.roles.map((r) => (r.id === "runner" ? { ...r, permissions: [...r.permissions, "menu.edit"] } : r));
    expect(adminChangePermissions(doc, { ...doc, roles }).permissions).toEqual(["team.manage"]);
  });

  it("flags any change that gives out, edits, or takes away the Admin role", () => {
    const doc = before();
    expect(adminChangePermissions(doc, { ...doc, members: [{ ...ada, role: "admin" }] }).touchesAdmins).toBe(true);
    const withAdmin = { ...doc, members: [{ ...ada, role: "admin" }] };
    expect(adminChangePermissions(withAdmin, { ...withAdmin, members: [] }).touchesAdmins).toBe(true);
    expect(adminChangePermissions(doc, { ...doc, members: [{ ...ada, name: "Ada L." }] }).touchesAdmins).toBe(false);
  });
});
