import { describe, expect, it } from "vitest";
import { defaultRoles, initialSettings, mapBounds, nearestRoutes } from "./model";
import type { Kitchen } from "./model";
import { emptySeatMap, type SeatMapDoc } from "@/lib/seatmap/schema";

function section(id: string, code: string, points: [number, number][]): SeatMapDoc["sections"][number] {
  return {
    id,
    code,
    name: code,
    categoryId: "c1",
    points,
    label: { text: "", size: 20, dx: 0, dy: 0, rotation: 0, visible: true },
    entrance: "",
    display: "seats",
    loose: false,
    rows: [],
    bend: 0,
    follow: "off",
    face: "auto",
    outline: "auto",
    padding: [3, 3, 3, 3],
  };
}

const emptyDoc = emptySeatMap();

const sectionDoc: SeatMapDoc = {
  ...emptySeatMap(),
  sections: [
    section("s1", "A", [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]),
    section("s2", "B", [
      [200, 0],
      [300, 0],
      [300, 100],
      [200, 100],
    ]),
  ],
};

describe("defaultRoles", () => {
  it("marks admin as builtin with full permissions", () => {
    const roles = defaultRoles();
    const admin = roles.find((r) => r.id === "admin");
    expect(admin?.builtin).toBe(true);
    expect(admin?.permissions.length).toBeGreaterThan(5);
  });

  it("Admin role cannot be removed — admin is always present and builtin", () => {
    const roles = defaultRoles();
    const admin = roles.find((r) => r.id === "admin");
    expect(admin?.builtin).toBe(true);
    expect(roles.some((r) => r.id === "admin")).toBe(true);
  });
});

describe("mapBounds", () => {
  it("returns defaults for empty doc", () => {
    expect(mapBounds(emptyDoc)).toEqual({ minX: -500, minY: -350, maxX: 500, maxY: 350 });
  });

  it("includes section points", () => {
    const b = mapBounds(sectionDoc);
    expect(b.minX).toBe(0);
    expect(b.maxX).toBe(300);
  });
});

describe("nearestRoutes", () => {
  const kitchens: Kitchen[] = [
    { id: "k1", name: "North", x: 50, y: 0, open: true, pickup: true, delivery: true, capacity: 10, prepMinutes: 8, overflow: false, overflowTo: null, overflowAt: 85, autoPause: false },
    { id: "k2", name: "South", x: 250, y: 100, open: true, pickup: true, delivery: true, capacity: 10, prepMinutes: 8, overflow: false, overflowTo: null, overflowAt: 85, autoPause: false },
  ];

  it("assigns each section to closest kitchen", () => {
    const routes = nearestRoutes(sectionDoc, kitchens);
    expect(routes.s1).toBe("k1");
    expect(routes.s2).toBe("k2");
  });

  it("returns empty when no kitchens", () => {
    expect(nearestRoutes(sectionDoc, [])).toEqual({});
  });
});

describe("initialSettings", () => {
  it("uppercases currency and wires routes", () => {
    const s = initialSettings(sectionDoc, "sek");
    expect(s.currency).toBe("SEK");
    expect(Object.keys(s.routes).length).toBe(2);
    expect(s.kitchens.length).toBeGreaterThan(0);
    expect(s.roles.some((r) => r.id === "admin")).toBe(true);
  });
});
