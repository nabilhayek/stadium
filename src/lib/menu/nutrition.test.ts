import { describe, expect, it } from "vitest";
import { descriptionFor, formatPer, toNutrition } from "./nutrition";

describe("toNutrition", () => {
  it("parses valid payload", () => {
    expect(
      toNutrition({
        per: { amount: 100, unit: "g" },
        kcal: 250,
        fatG: 10,
        carbsG: 30,
        proteinG: 8,
        sugarG: 5,
      }),
    ).toMatchObject({ kcal: 250, sugarG: 5 });
  });

  it("rejects malformed values", () => {
    expect(toNutrition(null)).toBeNull();
    expect(toNutrition({ per: { amount: -1, unit: "g" }, kcal: 1, fatG: 0, carbsG: 0, proteinG: 0 })).toBeNull();
    expect(toNutrition({ per: { amount: 1, unit: "kg" }, kcal: 1, fatG: 0, carbsG: 0, proteinG: 0 })).toBeNull();
    expect(toNutrition({ per: { amount: 100, unit: "g" }, kcal: "x", fatG: 0, carbsG: 0, proteinG: 0 })).toBeNull();
  });
});

describe("formatPer", () => {
  it("formats units", () => {
    expect(formatPer({ amount: 100, unit: "g" })).toBe("100 g");
    expect(formatPer({ amount: 500, unit: "ml" })).toBe("500 ml");
    expect(formatPer({ amount: 1, unit: "serving" })).toBe("serving");
    expect(formatPer({ amount: 2, unit: "serving" })).toBe("2 servings");
  });
});

describe("descriptionFor", () => {
  it("returns seed copy or null", () => {
    expect(descriptionFor("Cola 0.5L")).toMatch(/cola/i);
    expect(descriptionFor("Unknown SKU")).toBeNull();
  });
});
