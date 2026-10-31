import { describe, expect, it } from "vitest";
import { matchesQuery, normalize } from "./search";
import type { MenuProduct } from "@/lib/queries/stadium";

const product = (name: string, description = ""): MenuProduct =>
  ({
    id: "1",
    name,
    description,
    priceCents: 100,
    isSoldOut: false,
    isAvailable: true,
    categoryId: "c",
    imageUrl: null,
    optionGroups: [],
    nutrition: null,
    allergens: [],
  }) as MenuProduct;

describe("normalize", () => {
  it("strips accents", () => {
    expect(normalize("Pommes")).toBe("pommes");
    expect(normalize("Café")).toBe("cafe");
  });
});

describe("matchesQuery", () => {
  it("matches substrings and prefixes", () => {
    expect(matchesQuery(product("Cola 0.5L"), "cola")).toBe(true);
    expect(matchesQuery(product("Classic Hot Dog"), "hot")).toBe(true);
    expect(matchesQuery(product("Water"), "cola")).toBe(false);
  });

  it("matches drink aliases", () => {
    expect(matchesQuery(product("Cola 0.5L"), "coke")).toBe(true);
    expect(matchesQuery(product("French Fries"), "chips")).toBe(true);
  });

  it("empty query matches everything", () => {
    expect(matchesQuery(product("Anything"), "")).toBe(true);
  });
});
