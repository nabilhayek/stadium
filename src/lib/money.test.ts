import { describe, expect, it } from "vitest";
import { centsToInput, currencySymbol, formatCents, parseCents } from "./money";

describe("formatCents", () => {
  it("formats EUR", () => {
    expect(formatCents(350, "EUR")).toMatch(/3[.,]50/);
  });

  it("formats zero", () => {
    expect(formatCents(0, "EUR")).toMatch(/0[.,]00/);
  });
});

describe("currencySymbol", () => {
  it("returns a symbol for known currencies", () => {
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("SEK")).toMatch(/kr|SEK/i);
  });
});

describe("parseCents / centsToInput", () => {
  it("round-trips whole euros", () => {
    expect(parseCents("3.50")).toBe(350);
    expect(centsToInput(350)).toMatch(/3([.,]50)?/);
  });

  it("rejects junk", () => {
    expect(parseCents("abc")).toBeNull();
    expect(parseCents("")).toBeNull();
  });
});
