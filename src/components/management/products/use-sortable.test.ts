import { describe, expect, it } from "vitest";
import { moveItem } from "./use-sortable";

describe("moveItem", () => {
  it("moves an item without mutating the original", () => {
    const list = ["a", "b", "c", "d"];
    const next = moveItem(list, 1, 3);
    expect(next).toEqual(["a", "c", "d", "b"]);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });

  it("no-ops when from equals to", () => {
    const list = [1, 2, 3];
    expect(moveItem(list, 1, 1)).toEqual([1, 2, 3]);
  });

  it("moves to start", () => {
    expect(moveItem(["x", "y", "z"], 2, 0)).toEqual(["z", "x", "y"]);
  });
});
