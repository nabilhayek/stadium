import { describe, expect, it } from "vitest";
import { categoriesInput, optionGroupInput, productInput } from "./product-input";

const baseOption = { name: "Option A", priceCents: 0, isDefault: false, isSoldOut: false };

describe("optionGroupInput superRefine", () => {
  it("rejects multiple defaults on SINGLE", () => {
    const r = optionGroupInput.safeParse({
      name: "Size",
      selection: "SINGLE",
      required: true,
      maxSelect: null,
      options: [
        { ...baseOption, name: "A", isDefault: true },
        { ...baseOption, name: "B", isDefault: true },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects maxSelect above option count", () => {
    const r = optionGroupInput.safeParse({
      name: "Toppings",
      selection: "MULTIPLE",
      required: false,
      maxSelect: 3,
      options: [baseOption],
    });
    expect(r.success).toBe(false);
  });

  it("rejects all sold out when required", () => {
    const r = optionGroupInput.safeParse({
      name: "Sauce",
      selection: "SINGLE",
      required: true,
      maxSelect: null,
      options: [{ ...baseOption, isSoldOut: true }],
    });
    expect(r.success).toBe(false);
  });
});

describe("productInput", () => {
  it("accepts minimal product", () => {
    const r = productInput.safeParse({
      name: "Cola",
      description: "",
      categoryId: "cat",
      priceCents: 300,
      imageUrl: null,
      isAvailable: true,
      isSoldOut: false,
      nutrition: null,
      allergens: [],
      optionGroups: [],
    });
    expect(r.success).toBe(true);
  });
});

describe("categoriesInput", () => {
  it("requires at least one category", () => {
    expect(categoriesInput.safeParse([]).success).toBe(false);
  });

  it("rejects duplicate names case-insensitively", () => {
    const r = categoriesInput.safeParse([{ name: "Drinks" }, { name: "drinks" }]);
    expect(r.success).toBe(false);
  });

  it("enforces max categories", () => {
    const list = Array.from({ length: 31 }, (_, i) => ({ name: `Cat ${i}` }));
    expect(categoriesInput.safeParse(list).success).toBe(false);
  });
});
