import { describe, expect, it } from "vitest";
import { draftFrom, toInput } from "./draft";
import type { AdminProduct } from "@/lib/management/products";

const product: AdminProduct = {
  id: "prod-1",
  name: "Cheeseburger",
  description: "Tasty",
  imageUrl: null,
  priceCents: 850,
  categoryId: "cat-food",
  isAvailable: true,
  isSoldOut: false,
  nutrition: {
    per: { amount: 100, unit: "g" },
    kcal: 250,
    fatG: 12,
    carbsG: 20,
    proteinG: 15,
  },
  allergens: ["Gluten", "Milk"],
  sortOrder: 0,
  updatedAt: Date.now(),
  optionGroups: [
    {
      id: "g1",
      name: "Sauce",
      selection: "SINGLE",
      required: true,
      maxSelect: null,
      options: [{ id: "o1", name: "Ketchup", priceCents: 0, isDefault: true, isSoldOut: false }],
    },
  ],
};

describe("draftFrom / toInput", () => {
  it("round-trips a product to input", () => {
    const draft = draftFrom(product, "cat-food");
    expect(draft.name).toBe("Cheeseburger");
    expect(draft.hasNutrition).toBe(true);
    expect(draft.groups).toHaveLength(1);

    const parsed = toInput(draft);
    expect(parsed.errors).toBeNull();
    expect(parsed.input!.name).toBe("Cheeseburger");
    expect(parsed.input!.priceCents).toBe(850);
    expect(parsed.input!.optionGroups[0].options[0].name).toBe("Ketchup");
  });

  it("copy mode clears ids and tweaks name", () => {
    const draft = draftFrom(product, "cat-food", true);
    expect(draft.name).toContain("(copy)");
    expect(draft.isAvailable).toBe(false);
    expect(draft.groups[0].id).toBeUndefined();
  });

  it("reports price errors", () => {
    const draft = draftFrom(null, "cat-food");
    draft.price = "not-a-price";
    const parsed = toInput(draft);
    expect(parsed.input).toBeNull();
    expect(parsed.errors!.priceCents).toBeDefined();
  });
});
