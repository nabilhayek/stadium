import { describe, expect, it } from "vitest";
import { formatSeat, resolveSection, seatFromQuery } from "./store";

const sections = [
  { code: "G", name: "Lower West" },
  { code: "VIP", name: "VIP Lounge" },
];

describe("resolveSection", () => {
  it("finds section case-insensitively", () => {
    expect(resolveSection(sections, "g")).toEqual({ code: "G", name: "Lower West" });
  });

  it("falls back to synthetic name", () => {
    expect(resolveSection(sections, "z9")).toEqual({ code: "Z9", name: "Section Z9" });
  });
});

describe("seatFromQuery", () => {
  it("returns null without section or seat", () => {
    expect(seatFromQuery(undefined, sections)).toBeNull();
    expect(seatFromQuery({ section: "G" }, sections)).toBeNull();
    expect(seatFromQuery({ seat: "12" }, sections)).toBeNull();
  });

  it("builds seat with optional row", () => {
    expect(seatFromQuery({ section: "g", row: " 5 ", seat: "110" }, sections)).toEqual({
      sectionCode: "G",
      sectionName: "Lower West",
      row: "5",
      number: "110",
    });
    expect(seatFromQuery({ section: "VIP", seat: "2" }, sections)).toEqual({
      sectionCode: "VIP",
      sectionName: "VIP Lounge",
      row: "",
      number: "2",
    });
  });
});

describe("formatSeat", () => {
  const seat = { sectionCode: "G", sectionName: "Lower West", row: "5", number: "110" };

  it("short format", () => {
    expect(formatSeat(seat)).toBe("G-5-110");
    expect(formatSeat({ ...seat, row: "" })).toBe("G-110");
  });

  it("long format", () => {
    expect(formatSeat(seat, true)).toBe("Lower West · Row 5 · Seat 110");
    expect(formatSeat({ ...seat, row: "" }, true)).toBe("Lower West · Seat 110");
  });
});
