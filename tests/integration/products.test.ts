import "../support/server-mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withDb } from "@/lib/db";
import type { ProductInput } from "@/lib/management/product-input";
import { createKitchenUser, createProduct } from "../support/factories";
import { clearKitchenSession, kitchenCaller, makeSession, publicCaller } from "../support/caller";

beforeEach(() => clearKitchenSession());
afterEach(() => clearKitchenSession());

async function desk() {
  const { user } = await createKitchenUser();
  return kitchenCaller(makeSession(user.id, user.email));
}

async function firstCategoryId() {
  const category = await withDb((db) => db.category.findFirstOrThrow({ orderBy: { sortOrder: "asc" } }));
  return category.id;
}

async function productInput(overrides?: Partial<ProductInput>): Promise<ProductInput> {
  return {
    name: "Test Nachos",
    description: "Chips, cheese, salsa.",
    categoryId: await firstCategoryId(),
    priceCents: 650,
    imageUrl: null,
    isAvailable: true,
    isSoldOut: false,
    nutrition: null,
    allergens: ["Milk"],
    optionGroups: [
      {
        name: "Dip",
        selection: "SINGLE",
        required: true,
        maxSelect: null,
        options: [
          { name: "Salsa", priceCents: 0, isDefault: true, isSoldOut: false },
          { name: "Guacamole", priceCents: 150, isDefault: false, isSoldOut: false },
        ],
      },
    ],
    ...overrides,
  };
}

describe("products auth", () => {
  it("requires a kitchen session", async () => {
    clearKitchenSession();
    const caller = publicCaller();
    await expect(caller.products.list({ stadium: "arena" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.products.create({ stadium: "arena", product: await productInput() })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.products.delete({ stadium: "arena", id: "x" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("products list/create/update", () => {
  it("lists every product, disabled ones included, with categories and counts", async () => {
    const hidden = await createProduct({ name: "Disabled Thing" });
    await withDb((db) => db.product.update({ where: { id: hidden.id }, data: { isAvailable: false } }));
    const caller = await desk();

    const catalog = await caller.products.list({ stadium: "arena" });

    expect(catalog).not.toBeNull();
    expect(catalog!.stadiumName).toBe("Metropolis Arena");
    expect(catalog!.currency).toBe("EUR");
    expect(catalog!.products.find((p) => p.id === hidden.id)).toMatchObject({ name: "Disabled Thing", isAvailable: false });
    expect(catalog!.categories.map((c) => c.name)).toEqual(expect.arrayContaining(["Drinks", "Beer", "Snacks"]));
    expect(catalog!.categories.find((c) => c.name === "Drinks")!.productCount).toBeGreaterThan(0);
  });

  it("returns null for an unknown stadium", async () => {
    const caller = await desk();
    await expect(caller.products.list({ stadium: "nowhere" })).resolves.toBeNull();
    await expect(caller.products.create({ stadium: "nowhere", product: await productInput() })).resolves.toEqual({ ok: false, error: "Stadium not found." });
  });

  it("creates a product with option groups, shows it in the list and on the shop menu", async () => {
    const caller = await desk();
    const before = await caller.products.list({ stadium: "arena" });

    const created = await caller.products.create({ stadium: "arena", product: await productInput() });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.product).toMatchObject({ name: "Test Nachos", priceCents: 650, description: "Chips, cheese, salsa.", allergens: ["Milk"] });
    expect(created.product.optionGroups).toHaveLength(1);
    expect(created.product.optionGroups[0].options.map((o) => [o.name, o.priceCents])).toEqual([
      ["Salsa", 0],
      ["Guacamole", 150],
    ]);
    const maxSort = Math.max(...before!.products.map((p) => p.sortOrder));
    expect(created.product.sortOrder).toBe(maxSort + 1);

    const after = await caller.products.list({ stadium: "arena" });
    expect(after!.products).toHaveLength(before!.products.length + 1);
    const menu = await publicCaller().stadium.menu({ slug: "arena" });
    expect(menu!.products.map((p) => p.name)).toContain("Test Nachos");
  });

  it("validates product input", async () => {
    const caller = await desk();
    await expect(caller.products.create({ stadium: "arena", product: await productInput({ name: "   " }) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.products.create({ stadium: "arena", product: await productInput({ priceCents: -1 }) })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(caller.products.create({ stadium: "arena", product: await productInput({ imageUrl: "https://example.com/pic.png" }) })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("updates scalars and edits option groups in place, keeping the ids that stay", async () => {
    const caller = await desk();
    const created = await caller.products.create({ stadium: "arena", product: await productInput() });
    if (!created.ok) throw new Error(created.error);
    const group = created.product.optionGroups[0];
    const salsa = group.options[0];

    const updated = await caller.products.update({
      stadium: "arena",
      id: created.product.id,
      product: await productInput({
        name: "Test Nachos XL",
        priceCents: 900,
        optionGroups: [
          {
            id: group.id,
            name: "Dip",
            selection: "SINGLE",
            required: true,
            maxSelect: null,
            options: [
              { id: salsa.id, name: "Hot salsa", priceCents: 0, isDefault: true, isSoldOut: false },
              { name: "Sour cream", priceCents: 100, isDefault: false, isSoldOut: false },
            ],
          },
        ],
      }),
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.product).toMatchObject({ id: created.product.id, name: "Test Nachos XL", priceCents: 900 });
    expect(updated.product.optionGroups).toHaveLength(1);
    expect(updated.product.optionGroups[0].id).toBe(group.id);
    expect(updated.product.optionGroups[0].options.map((o) => o.name)).toEqual(["Hot salsa", "Sour cream"]);
    expect(updated.product.optionGroups[0].options[0].id).toBe(salsa.id);
    // The dropped option is gone, a new one took its slot.
    expect(updated.product.optionGroups[0].options.map((o) => o.id)).not.toContain(group.options[1].id);
  });

  it("update returns a soft failure for an unknown product", async () => {
    const caller = await desk();
    await expect(caller.products.update({ stadium: "arena", id: "missing", product: await productInput() })).resolves.toEqual({
      ok: false,
      error: "Product not found.",
    });
  });
});

describe("products.setFlags", () => {
  it("toggles sold out and availability, reflected on the shop menu", async () => {
    const product = await createProduct({ name: "Flag Test Soda" });
    const caller = await desk();

    const soldOut = await caller.products.setFlags({ stadium: "arena", id: product.id, flags: { isSoldOut: true } });
    expect(soldOut.ok && soldOut.product).toMatchObject({ isSoldOut: true, isAvailable: true });
    let menu = await publicCaller().stadium.menu({ slug: "arena" });
    expect(menu!.products.find((p) => p.id === product.id)).toMatchObject({ isSoldOut: true });

    const disabled = await caller.products.setFlags({ stadium: "arena", id: product.id, flags: { isAvailable: false } });
    expect(disabled.ok && disabled.product).toMatchObject({ isAvailable: false, isSoldOut: true });
    menu = await publicCaller().stadium.menu({ slug: "arena" });
    expect(menu!.products.map((p) => p.id)).not.toContain(product.id);
  });

  it("reports an unknown product softly", async () => {
    const caller = await desk();
    await expect(caller.products.setFlags({ stadium: "arena", id: "missing", flags: { isSoldOut: true } })).resolves.toEqual({
      ok: false,
      error: "Product not found.",
    });
  });
});

describe("products.delete", () => {
  it("deletes a product that no order references", async () => {
    const product = await createProduct({ name: "Delete Me" });
    const caller = await desk();

    await expect(caller.products.delete({ stadium: "arena", id: product.id })).resolves.toEqual({ ok: true });
    await expect(withDb((db) => db.product.findUnique({ where: { id: product.id } }))).resolves.toBeNull();
    await expect(caller.products.delete({ stadium: "arena", id: product.id })).resolves.toEqual({ ok: false, error: "Product not found." });
  });

  it("refuses to delete a product that is on an older order", async () => {
    const product = await createProduct({ name: "Ordered Before" });
    const stadium = await withDb((db) => db.stadium.findUniqueOrThrow({ where: { slug: "arena" } }));
    await withDb((db) =>
      db.order.create({
        data: {
          code: "LEGACY1",
          stadiumId: stadium.id,
          totalCents: 500,
          currency: "EUR",
          items: { create: [{ productId: product.id, name: product.name, unitCents: 500, quantity: 1 }] },
        },
      }),
    );
    const caller = await desk();

    const result = await caller.products.delete({ stadium: "arena", id: product.id });
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain("Disable it instead");
    await expect(withDb((db) => db.product.findUnique({ where: { id: product.id } }))).resolves.not.toBeNull();
  });
});

describe("products.saveCategories", () => {
  async function currentList() {
    const rows = await withDb((db) => db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }));
    return rows;
  }

  it("refuses to drop a category that still has products", async () => {
    const caller = await desk();
    const all = await currentList();
    const withoutSweets = all.filter((c) => c.name !== "Sweets");

    const result = await caller.products.saveCategories({ stadium: "arena", categories: withoutSweets });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/Sweets still has \d+ products?/);
    await expect(currentList()).resolves.toHaveLength(all.length);
  });

  it("renames, reorders, adds and removes empty categories", async () => {
    const caller = await desk();
    const all = await currentList();
    const drinks = all.find((c) => c.name === "Drinks")!;
    const rest = all.filter((c) => c.id !== drinks.id);

    // Add a throwaway category first so there is an empty one to delete.
    const added = await caller.products.saveCategories({ stadium: "arena", categories: [...all, { name: "Merch" }] });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.categories.map((c) => c.name)).toContain("Merch");
    const merch = added.categories.find((c) => c.name === "Merch")!;
    expect(merch.productCount).toBe(0);

    const result = await caller.products.saveCategories({
      stadium: "arena",
      categories: [...rest, { id: drinks.id, name: "Soft drinks" }, { name: "Specials" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.categories.map((c) => c.name);
    expect(names.slice(-2)).toEqual(["Soft drinks", "Specials"]);
    expect(names).not.toContain("Merch");
    expect(result.categories.find((c) => c.id === drinks.id)!.name).toBe("Soft drinks");
    expect(result.categories.find((c) => c.name === "Specials")!.id).not.toBe(merch.id);
  });

  it("rejects duplicate names and an empty list", async () => {
    const caller = await desk();
    await expect(caller.products.saveCategories({ stadium: "arena", categories: [{ name: "Same" }, { name: "same" }] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(caller.products.saveCategories({ stadium: "arena", categories: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
