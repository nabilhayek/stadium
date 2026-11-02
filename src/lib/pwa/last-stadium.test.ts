import { describe, expect, it } from "vitest";
import { shortcutPath } from "./last-stadium";

describe("shortcutPath", () => {
  it("sends a home-screen shortcut to the venue this phone used last", () => {
    expect(shortcutPath("menu", "arena", ["arena", "harbour"])).toBe("/arena");
    expect(shortcutPath("orders", "arena", ["arena"])).toBe("/arena/orders");
  });

  it("stays on the venue list when there is nothing safe to follow", () => {
    expect(shortcutPath(null, "arena", ["arena"])).toBeNull();
    expect(shortcutPath("menu", null, ["arena"])).toBeNull();
    expect(shortcutPath("menu", "closed-venue", ["arena"])).toBeNull();
    expect(shortcutPath("toString", "arena", ["arena"])).toBeNull();
  });
});
