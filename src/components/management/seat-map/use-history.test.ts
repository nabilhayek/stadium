import { describe, expect, it } from "vitest";
import { emptySeatMap } from "@/lib/seatmap/schema";
import { seatMapHistoryReducer } from "./use-history";

const t0 = 1_000_000;

function state(doc = emptySeatMap()) {
  return { doc, past: [] as ReturnType<typeof emptySeatMap>[], future: [] as ReturnType<typeof emptySeatMap>[], key: null as string | null, at: t0 };
}

describe("seatMapHistoryReducer", () => {
  it("pushes past on commit", () => {
    const s0 = state();
    const doc1 = { ...emptySeatMap(), sections: [] };
    const s1 = seatMapHistoryReducer(s0, { type: "commit", doc: doc1, key: null, at: t0 + 1, hold: false });
    expect(s1.doc).toBe(doc1);
    expect(s1.past).toEqual([s0.doc]);
    expect(s1.future).toEqual([]);
  });

  it("coalesces commits with the same key within the window", () => {
    const s0 = state();
    const doc1 = emptySeatMap();
    const doc2 = { ...doc1, pois: [{ id: "p", kind: "kitchen" as const, x: 0, y: 0, label: "K", w: 0, h: 0, rotation: 0 }] };
    const s1 = seatMapHistoryReducer(s0, { type: "commit", doc: doc1, key: "nudge", at: t0 + 100, hold: false });
    const s2 = seatMapHistoryReducer(s1, { type: "commit", doc: doc2, key: "nudge", at: t0 + 500, hold: false });
    expect(s2.past).toHaveLength(1);
    expect(s2.past[0]).toBe(s0.doc);
    expect(s2.doc).toBe(doc2);
  });

  it("hold merges regardless of time gap", () => {
    const s0 = state();
    const doc1 = emptySeatMap();
    const doc2 = { ...doc1, decorations: [] };
    const s1 = seatMapHistoryReducer(s0, { type: "commit", doc: doc1, key: "agent", at: t0, hold: true });
    const s2 = seatMapHistoryReducer(s1, { type: "commit", doc: doc2, key: "agent", at: t0 + 99_999, hold: true });
    expect(s2.past).toHaveLength(1);
  });

  it("undo and redo restore documents", () => {
    const s0 = state();
    const doc1 = emptySeatMap();
    const s1 = seatMapHistoryReducer(s0, { type: "commit", doc: doc1, key: null, at: t0 + 1, hold: false });
    const undone = seatMapHistoryReducer(s1, { type: "undo" });
    expect(undone.doc).toBe(s0.doc);
    expect(undone.future[0]).toBe(doc1);
    const redone = seatMapHistoryReducer(undone, { type: "redo" });
    expect(redone.doc).toBe(doc1);
  });

  it("ignores noop commits", () => {
    const s0 = state();
    const same = seatMapHistoryReducer(s0, { type: "commit", doc: s0.doc, key: null, at: t0 + 1, hold: false });
    expect(same).toBe(s0);
  });
});
