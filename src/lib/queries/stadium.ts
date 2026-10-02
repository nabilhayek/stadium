import { withDb } from "@/lib/db";
import { FALLBACK_ARENA } from "./fallback-arena";

export const MENU_REVALIDATE_SECONDS = 60;

/** Everything the shop and checkout pages need, in one round trip. */
export async function getStadiumMenu(slug: string) {
  try {
    return await withDb(async (db) => {
    const stadium = await db.stadium.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      currency: true,
      sections: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, code: true, name: true },
      },
      products: {
        where: { isAvailable: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          imageUrl: true,
          priceCents: true,
          categoryId: true,
        },
      },
    },
  });
  if (!stadium) return null;

  const usedCategoryIds = new Set(stadium.products.map((p) => p.categoryId));
  const categories = await db.category.findMany({
    where: { id: { in: [...usedCategoryIds] } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, slug: true, name: true, icon: true },
  });

    return { ...stadium, categories };
    });
  } catch (e) {
    if (slug === FALLBACK_ARENA.slug) {
      console.warn("Database unavailable, using fallback menu.", e);
      return FALLBACK_ARENA;
    }
    throw e;
  }
}

export type StadiumMenu = NonNullable<Awaited<ReturnType<typeof getStadiumMenu>>>;
export type MenuProduct = StadiumMenu["products"][number];
export type MenuCategory = StadiumMenu["categories"][number];

export function findMenuProduct(menu: StadiumMenu, productId: string) {
  const product = menu.products.find((p) => p.id === productId);
  if (!product) return null;
  const category = menu.categories.find((c) => c.id === product.categoryId) ?? null;
  return { product, category };
}

export function getActiveStadiums() {
  return withDb((db) =>
    db.stadium.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { slug: true, name: true, city: true },
    }),
  );
}
