import { describe, expect, it } from "vitest";
import { catalogFromProducts, drinksFromCatalog } from "./catalog";

describe("catalogFromProducts", () => {
  it("maps products and needsChoice from required groups", () => {
    const items = catalogFromProducts([
      {
        id: "p1",
        name: "Burger",
        priceCents: 800,
        categoryId: "food",
        isSoldOut: false,
        optionGroups: [{ required: true }, { required: false }],
      },
      { id: "p2", name: "Water", priceCents: 200, categoryId: "drinks", isSoldOut: true, optionGroups: [] },
    ]);
    expect(items[0]).toMatchObject({ productId: "p1", needsChoice: true, unitCents: 800 });
    expect(items[1].needsChoice).toBe(false);
    expect(items[1].isSoldOut).toBe(true);
  });
});

describe("drinksFromCatalog", () => {
  const catalog = catalogFromProducts([
    { id: "c1", name: "Cola", priceCents: 300, categoryId: "cat-drinks", isSoldOut: false, optionGroups: [] },
    { id: "b1", name: "Lager", priceCents: 600, categoryId: "cat-beer", isSoldOut: false, optionGroups: [] },
    { id: "f1", name: "Fries", priceCents: 400, categoryId: "cat-food", isSoldOut: false, optionGroups: [{ required: true }] },
    { id: "w1", name: "Water", priceCents: 200, categoryId: "cat-drinks", isSoldOut: true, optionGroups: [] },
  ]);
  const categories = [
    { id: "cat-drinks", slug: "drinks" },
    { id: "cat-beer", slug: "beer" },
    { id: "cat-food", slug: "snacks" },
  ];

  it("returns available simple drinks and beer", () => {
    const drinks = drinksFromCatalog(catalog, categories);
    expect(drinks.map((d) => d.productId)).toEqual(["c1", "b1"]);
  });
});
