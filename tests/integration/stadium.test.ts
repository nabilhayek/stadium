import "../support/server-mocks";
import { describe, expect, it } from "vitest";
import { withDb } from "@/lib/db";
import { createProduct } from "../support/factories";
import { publicCaller } from "../support/caller";

describe("stadium router", () => {
  it("menu returns the arena with sections, categories and products", async () => {
    const menu = await publicCaller().stadium.menu({ slug: "arena" });

    expect(menu).not.toBeNull();
    expect(menu!.slug).toBe("arena");
    expect(menu!.name).toBe("Metropolis Arena");
    expect(menu!.currency).toBe("EUR");
    expect(menu!.sections.map((s) => s.code)).toEqual(expect.arrayContaining(["N", "E", "S", "W"]));
    expect(menu!.products.length).toBeGreaterThan(5);
    expect(menu!.categories.map((c) => c.slug)).toEqual(expect.arrayContaining(["drinks", "beer", "snacks"]));

    const cola = menu!.products.find((p) => p.name === "Cola 0.5L");
    expect(cola).toMatchObject({ priceCents: 350, isSoldOut: false });
    expect(cola!.optionGroups).toEqual([]);
    expect(cola!.allergens).toEqual([]);
    // Every product points at a category that is returned alongside it.
    const categoryIds = new Set(menu!.categories.map((c) => c.id));
    for (const p of menu!.products) expect(categoryIds.has(p.categoryId)).toBe(true);
  });

  it("menu hides unavailable products and includes option groups", async () => {
    const withOptions = await createProduct({ name: "Sized Soda", priceCents: 400, withOptions: true });
    const hidden = await createProduct({ name: "Hidden Soda" });
    await withDb((db) => db.product.update({ where: { id: hidden.id }, data: { isAvailable: false } }));

    const menu = await publicCaller().stadium.menu({ slug: "arena" });
    const names = menu!.products.map((p) => p.name);
    expect(names).toContain("Sized Soda");
    expect(names).not.toContain("Hidden Soda");

    const sized = menu!.products.find((p) => p.id === withOptions.id)!;
    expect(sized.optionGroups).toHaveLength(1);
    expect(sized.optionGroups[0]).toMatchObject({ name: "Size", selection: "SINGLE", required: true });
    expect(sized.optionGroups[0].options.map((o) => o.name)).toEqual(["Small", "Large"]);
  });

  it("menu returns null for an unknown slug", async () => {
    await expect(publicCaller().stadium.menu({ slug: "no-such-stadium" })).resolves.toBeNull();
  });

  it("menu returns null for an inactive stadium", async () => {
    await withDb((db) => db.stadium.update({ where: { slug: "arena" }, data: { isActive: false } }));
    await expect(publicCaller().stadium.menu({ slug: "arena" })).resolves.toBeNull();
  });

  it("active lists the open stadiums", async () => {
    const active = await publicCaller().stadium.active();
    expect(active).toEqual(expect.arrayContaining([expect.objectContaining({ slug: "arena", name: "Metropolis Arena", city: "Amsterdam" })]));

    await withDb((db) => db.stadium.update({ where: { slug: "arena" }, data: { isActive: false } }));
    expect((await publicCaller().stadium.active()).map((s) => s.slug)).not.toContain("arena");
  });
});
