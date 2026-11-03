import "../support/server-mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withDb } from "@/lib/db";
import { emptySeatMap, type SeatMapDoc, type SeatMapSection } from "@/lib/seatmap/schema";
import { createKitchenUser, makeSeatMapDoc } from "../support/factories";
import { clearKitchenSession, kitchenCaller, makeSession, publicCaller } from "../support/caller";

beforeEach(() => clearKitchenSession());
afterEach(() => clearKitchenSession());

async function desk() {
  const { user } = await createKitchenUser();
  return kitchenCaller(makeSession(user.id, user.email));
}

function section(code: string, name = `Stand ${code}`, x = 0): SeatMapSection {
  return {
    id: `sec-${code.toLowerCase()}`,
    code,
    name,
    categoryId: "lower",
    points: [
      [x, 0],
      [x + 100, 0],
      [x + 100, 100],
      [x, 100],
    ],
    label: { text: "", size: 20, dx: 0, dy: 0, rotation: 0, visible: true },
    entrance: "",
    display: "block",
    loose: false,
    rows: [],
    bend: 0,
    follow: "off",
    face: "auto",
    outline: "drawn",
    padding: [3, 3, 3, 3],
  };
}

const docWith = (...sections: SeatMapSection[]): SeatMapDoc => makeSeatMapDoc({ sections });

describe("seatMap auth", () => {
  it("requires a kitchen session", async () => {
    clearKitchenSession();
    const caller = publicCaller();
    await expect(caller.seatMap.get({ stadium: "arena" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.seatMap.saveDraft({ stadium: "arena", revision: 0, doc: emptySeatMap() })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.seatMap.publish({ stadium: "arena", revision: 0, doc: emptySeatMap() })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("seatMap.get", () => {
  it("returns an empty draft at revision 0 plus the stadium's current sections", async () => {
    const caller = await desk();
    const state = await caller.seatMap.get({ stadium: "arena" });

    expect(state).not.toBeNull();
    expect(state!.stadiumName).toBe("Metropolis Arena");
    expect(state!.revision).toBe(0);
    expect(state!.publishedAt).toBeNull();
    expect(state!.draft.sections).toEqual([]);
    expect(state!.sections.map((s) => s.code)).toEqual(["N", "E", "S", "W", "G"]);
  });

  it("answers NOT_FOUND for an unknown stadium", async () => {
    const caller = await desk();
    await expect(caller.seatMap.get({ stadium: "nowhere" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("seatMap.saveDraft", () => {
  it("creates the draft at revision 1 and bumps the revision on each save", async () => {
    const caller = await desk();

    await expect(caller.seatMap.saveDraft({ stadium: "arena", revision: 0, doc: docWith(section("A")) })).resolves.toEqual({ ok: true, revision: 1 });
    await expect(caller.seatMap.saveDraft({ stadium: "arena", revision: 1, doc: docWith(section("A"), section("B", "Stand B", 200)) })).resolves.toEqual({
      ok: true,
      revision: 2,
    });

    const state = await caller.seatMap.get({ stadium: "arena" });
    expect(state!.revision).toBe(2);
    expect(state!.draft.sections.map((s) => s.code)).toEqual(["A", "B"]);
    // Saving a draft never touches the live Section rows.
    expect(state!.sections.map((s) => s.code)).toEqual(["N", "E", "S", "W", "G"]);
    expect(state!.publishedAt).toBeNull();
  });

  it("rejects a stale revision so an old tab cannot overwrite newer work", async () => {
    const caller = await desk();
    await caller.seatMap.saveDraft({ stadium: "arena", revision: 0, doc: docWith(section("A")) });
    await caller.seatMap.saveDraft({ stadium: "arena", revision: 1, doc: docWith(section("B", "Newer")) });

    const stale = await caller.seatMap.saveDraft({ stadium: "arena", revision: 1, doc: docWith(section("C", "Old tab")) });
    expect(stale).toMatchObject({ ok: false });
    expect(!stale.ok && stale.error).toContain("changed in another tab");

    // A second "first save" from another tab is stale as well.
    const secondFirst = await caller.seatMap.saveDraft({ stadium: "arena", revision: 0, doc: docWith(section("D")) });
    expect(secondFirst.ok).toBe(false);

    const state = await caller.seatMap.get({ stadium: "arena" });
    expect(state!.revision).toBe(2);
    expect(state!.draft.sections.map((s) => s.code)).toEqual(["B"]);
  });

  it("rejects an invalid document with BAD_REQUEST and an unknown stadium with NOT_FOUND", async () => {
    const caller = await desk();
    const bad = docWith({ ...section("A"), code: "lower case!" });
    await expect(caller.seatMap.saveDraft({ stadium: "arena", revision: 0, doc: bad })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.seatMap.saveDraft({ stadium: "nowhere", revision: 0, doc: emptySeatMap() })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("seatMap.publish", () => {
  it("refuses a map with blocking validation errors and publishes nothing", async () => {
    const caller = await desk();
    const duplicate = docWith(section("A"), { ...section("A", "Stand A again", 200), id: "sec-a2" });

    const result = await caller.seatMap.publish({ stadium: "arena", revision: 0, doc: duplicate });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("Section code A is used more than once");
    const state = await caller.seatMap.get({ stadium: "arena" });
    expect(state!.revision).toBe(0);
    expect(state!.publishedAt).toBeNull();
    expect(state!.sections.map((s) => s.code)).toEqual(["N", "E", "S", "W", "G"]);
  });

  it("refuses a section that uses a deleted category", async () => {
    const caller = await desk();
    const result = await caller.seatMap.publish({ stadium: "arena", revision: 0, doc: docWith({ ...section("A"), categoryId: "gone" }) });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("deleted category");
  });

  it("publishes a first map: syncs sections by code and removes the ones that left", async () => {
    const caller = await desk();
    const before = Date.now();

    const result = await caller.seatMap.publish({
      stadium: "arena",
      revision: 0,
      doc: docWith(section("N", "North Renamed"), section("A", "New Stand A", 200)),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.revision).toBe(1);
    const published = await withDb((db) => db.auditEvent.findFirst({ where: { action: "seatmap.published" }, orderBy: { createdAt: "desc" } }));
    expect(published?.detail).toMatchObject({ revision: 1 });
    expect(result.publishedAt).toBeGreaterThanOrEqual(before);
    expect(result.kept).toEqual([]);
    expect(result.sections).toEqual([
      { code: "N", name: "North Renamed" },
      { code: "A", name: "New Stand A" },
    ]);

    const state = await caller.seatMap.get({ stadium: "arena" });
    expect(state!.publishedAt).toBe(result.publishedAt);
    expect(state!.sections.map((s) => s.code)).toEqual(["N", "A"]);
    // The public shop now lists the new sections.
    const menu = await publicCaller().stadium.menu({ slug: "arena" });
    expect(menu!.sections.map((s) => s.code)).toEqual(["N", "A"]);
  });

  it("publishes over an existing draft and rejects a stale revision", async () => {
    const caller = await desk();
    await caller.seatMap.saveDraft({ stadium: "arena", revision: 0, doc: docWith(section("A")) });

    const stale = await caller.seatMap.publish({ stadium: "arena", revision: 0, doc: docWith(section("A")) });
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.error).toContain("changed in another tab");

    const ok = await caller.seatMap.publish({ stadium: "arena", revision: 1, doc: docWith(section("A")) });
    expect(ok).toMatchObject({ ok: true, revision: 2 });
  });

  it("keeps a section that older orders still point at", async () => {
    const stadium = await withDb((db) => db.stadium.findUniqueOrThrow({ where: { slug: "arena" } }));
    const south = await withDb((db) => db.section.findFirstOrThrow({ where: { stadiumId: stadium.id, code: "S" } }));
    await withDb((db) => db.order.create({ data: { code: "LEGACY2", stadiumId: stadium.id, sectionId: south.id, totalCents: 500, currency: "EUR" } }));
    const caller = await desk();

    const result = await caller.seatMap.publish({ stadium: "arena", revision: 0, doc: docWith(section("A")) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kept).toEqual(["S"]);
    expect(result.sections.map((s) => s.code)).toEqual(["A", "S"]);
  });
});
