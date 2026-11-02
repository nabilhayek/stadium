import { describe, expect, it } from "vitest";
import { currencyFlag, localeFlag } from "./flag-codes";

describe("localeFlag", () => {
  it("maps app locales to ISO country codes", () => {
    expect(localeFlag("sv")).toBe("se");
    expect(localeFlag("da")).toBe("dk");
    expect(localeFlag("en")).toBe("gb");
  });
});

describe("currencyFlag", () => {
  it("maps supported currencies", () => {
    expect(currencyFlag("EUR")).toBe("eu");
    expect(currencyFlag("sek")).toBe("se");
    expect(currencyFlag("USD")).toBe("us");
  });
});
