import { describe, expect, it } from "vitest";
import { emptySeatMap } from "../schema";
import type { SeatMapPatch } from "./patch";
import { createSeatMapTools } from "./tools";

function setup() {
  const patches: SeatMapPatch[] = [];
  const state = { doc: emptySeatMap() };
  const tools = createSeatMapTools(state, async (patch) => {
    patches.push(patch);
  });
  return { state, tools, patches };
}

async function runTool(tools: ReturnType<typeof createSeatMapTools>, name: keyof ReturnType<typeof createSeatMapTools>, input: Record<string, unknown>) {
  const t = tools[name];
  // @ts-expect-error AI SDK tool execute
  return (await t.execute(input)) as string;
}

describe("createSeatMapTools", () => {
  it("get_map and check_map read state without mutating", async () => {
    const { state, tools } = setup();
    const before = structuredClone(state.doc);
    expect(await runTool(tools, "get_map", {})).toMatch(/seats/);
    expect(await runTool(tools, "check_map", {})).toBe("No issues.");
    expect(state.doc).toEqual(before);
  });

  it("set_field and clear_map mutate via publish", async () => {
    const { state, tools, patches } = setup();
    const note = await runTool(tools, "set_field", { kind: "football" });
    expect(note.startsWith("Error:")).toBe(false);
    expect(patches.length).toBe(1);
    expect(state.doc.decorations.some((d) => d.kind === "venue")).toBe(true);
    const cleared = await runTool(tools, "clear_map", {});
    expect(cleared.startsWith("Error:")).toBe(false);
    expect(state.doc.sections).toHaveLength(0);
  });

  it("invalid set_field leaves doc unchanged", async () => {
    const { state, tools } = setup();
    const before = structuredClone(state.doc);
    const msg = await runTool(tools, "set_field", { kind: "football", length_m: 1, width_m: 1 });
    expect(msg.startsWith("Error:")).toBe(true);
    expect(state.doc).toEqual(before);
  });

  it("invalid add_ring without seat plan returns Error", async () => {
    const { state, tools } = setup();
    await runTool(tools, "set_field", { kind: "football" });
    const before = structuredClone(state.doc);
    const msg = await runTool(tools, "add_ring", { sections: 4 });
    expect(msg.startsWith("Error:")).toBe(true);
    expect(state.doc).toEqual(before);
  });

  it("add_stand succeeds on a fresh bowl", async () => {
    const { state, tools } = setup();
    await runTool(tools, "set_field", { kind: "football" });
    const msg = await runTool(tools, "add_stand", { side: "north", seats: 200, sections: 2, rows: 5 });
    expect(msg.startsWith("Error:")).toBe(false);
    expect(state.doc.sections.length).toBeGreaterThan(0);
  });

  it("invalid add_stand leaves doc unchanged", async () => {
    const { state, tools } = setup();
    const before = structuredClone(state.doc);
    const msg = await runTool(tools, "add_stand", { side: "north" });
    expect(msg.startsWith("Error:")).toBe(true);
    expect(state.doc).toEqual(before);
  });

  it("add_section and add_shape", async () => {
    const { state, tools } = setup();
    await runTool(tools, "set_field", { kind: "football" });
    const section = await runTool(tools, "add_section", { seats: 120, side: "east" });
    expect(section.startsWith("Error:")).toBe(false);
    const shape = await runTool(tools, "add_shape", { kind: "stage", w_m: 20, h_m: 10, anchor: "north" });
    expect(shape.startsWith("Error:")).toBe(false);
    expect(state.doc.decorations.some((d) => d.kind === "stage")).toBe(true);
  });

  it("add_floor and add_points on a concert field", async () => {
    const { tools } = setup();
    await runTool(tools, "set_field", { kind: "concert_floor", length_m: 60, width_m: 40 });
    const floor = await runTool(tools, "add_floor", { seats: 400, blocks: 2 });
    expect(floor.startsWith("Error:")).toBe(false);
    const points = await runTool(tools, "add_points", { kind: "entrance", count: 2 });
    expect(points.startsWith("Error:")).toBe(false);
  });

  it("add_stairs returns Error without mutating when no aisles qualify", async () => {
    const { state, tools } = setup();
    await runTool(tools, "set_field", { kind: "football" });
    await runTool(tools, "add_stand", { side: "north", seats: 200, sections: 2, rows: 5 });
    const before = structuredClone(state.doc);
    const codes = state.doc.sections.map((s) => s.code);
    const stairs = await runTool(tools, "add_stairs", { target: { codes } });
    expect(stairs.startsWith("Error:")).toBe(true);
    expect(stairs).toMatch(/aisles/i);
    expect(state.doc).toEqual(before);
  });

  it("update_sections, move_sections, set_category, remove", async () => {
    const { state, tools } = setup();
    await runTool(tools, "set_field", { kind: "football" });
    await runTool(tools, "add_stand", { side: "south", seats: 100, sections: 2, rows: 4 });
    const codes = state.doc.sections.map((s) => s.code);
    const updated = await runTool(tools, "update_sections", { target: { codes: [codes[0]] }, seats: 80 });
    expect(updated.startsWith("Error:")).toBe(false);
    const moved = await runTool(tools, "move_sections", { target: { codes }, slide_m: 2 });
    expect(moved.startsWith("Error:")).toBe(false);
    const cat = await runTool(tools, "set_category", { name: "VIP", color: "#112233" });
    expect(cat.startsWith("Error:")).toBe(false);
    const removed = await runTool(tools, "remove", { points: ["stairs"] });
    expect(removed.startsWith("Error:")).toBe(false);
  });

  it("invalid update_sections target returns Error and preserves doc", async () => {
    const { state, tools } = setup();
    const before = structuredClone(state.doc);
    const msg = await runTool(tools, "update_sections", { target: {}, seats: 10 });
    expect(msg.startsWith("Error:")).toBe(true);
    expect(state.doc).toEqual(before);
  });

  it("invalid set_category color leaves doc unchanged", async () => {
    const { state, tools } = setup();
    const before = structuredClone(state.doc);
    const msg = await runTool(tools, "set_category", { name: "Bad", color: "red" });
    expect(msg.startsWith("Error:")).toBe(true);
    expect(state.doc).toEqual(before);
  });
});
