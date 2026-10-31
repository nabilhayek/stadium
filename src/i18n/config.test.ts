import { describe, expect, it } from "vitest";
import { defaultLocale, isLocale, matchAcceptLanguage } from "./config";

describe("isLocale", () => {
  it("accepts the three locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("sv")).toBe(true);
    expect(isLocale("da")).toBe(true);
    expect(isLocale("no")).toBe(false);
    expect(isLocale("EN")).toBe(false);
  });
});

describe("matchAcceptLanguage", () => {
  it("prefers an exact match", () => {
    expect(matchAcceptLanguage("sv-SE,sv;q=0.9,en;q=0.8")).toBe("sv");
    expect(matchAcceptLanguage("da-DK,en;q=0.5")).toBe("da");
  });

  it("falls back to English", () => {
    expect(matchAcceptLanguage("nb-NO,nb;q=0.9")).toBe(defaultLocale);
    expect(matchAcceptLanguage("")).toBe(defaultLocale);
    expect(matchAcceptLanguage(null)).toBe(defaultLocale);
  });
});
