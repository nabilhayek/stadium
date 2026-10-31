import { describe, expect, it } from "vitest";
import { initialSettings } from "@/components/management/admin/model";
import { emptySeatMap } from "@/lib/seatmap/schema";
import { normalizeAdminSettings, readsAcceptOrders } from "./admin-settings";

function draft(overrides?: Record<string, unknown>) {
  return { ...initialSettings(emptySeatMap(), "EUR"), members: [], ...overrides };
}

describe("normalizeAdminSettings", () => {
  it("keeps a valid document and lowercases emails", () => {
    const result = normalizeAdminSettings(
      draft({
        members: [{ id: "m1", name: "Ada", email: "Ada@Example.com", role: "kitchen", permissions: null, kitchens: [], status: "invited", lastSeen: "Yesterday" }],
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
        members: [{ id: "m1", name: "Ada", email: "ada@example.com", role: "admin", permissions: ["orders.view"], kitchens: ["nope"], status: "active", lastSeen: null }],
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
