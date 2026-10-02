/** Flattened menu rows the client can refill a cart from without another fetch. */

export type CatalogItem = {
  productId: string;
  name: string;
  unitCents: number;
  categoryId: string;
};

type ProductLike = { id: string; name: string; priceCents: number; categoryId: string };
type CategoryLike = { id: string; slug: string };

const DRINK_SLUGS = new Set(["drinks", "beer"]);

export function catalogFromProducts(products: ProductLike[]): CatalogItem[] {
  return products.map((p) => ({
    productId: p.id,
    name: p.name,
    unitCents: p.priceCents,
    categoryId: p.categoryId,
  }));
}

export function drinksFromCatalog(catalog: CatalogItem[], categories: CategoryLike[]): CatalogItem[] {
  const drinkIds = new Set(categories.filter((c) => DRINK_SLUGS.has(c.slug)).map((c) => c.id));
  return catalog.filter((item) => drinkIds.has(item.categoryId));
}
