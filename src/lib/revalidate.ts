import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { locales } from "@/i18n/config";
import { MENU_TAG, STADIUMS_TAG } from "@/lib/queries/stadium";

/**
 * Pages are cached per language under `app/[locale]`, so a path is purged once per language.
 * Literal paths are always purged without a type (Next docs: omit type for `/product/1`-style paths).
 * When `type` is set, the same path is also purged as that segment so nested pages under a layout refresh.
 */
export function revalidateLocalized(path: string, type?: "layout" | "page") {
  for (const locale of locales) {
    const full = `/${locale}${path === "/" ? "" : path}`;
    revalidatePath(full);
    if (type) revalidatePath(full, type);
  }
}

/**
 * Mark the cached menu stale. Called from tRPC (a route handler), so this uses `revalidateTag`; `updateTag` is only
 * valid inside a Server Action.
 *
 * Tag only, on purpose. The shop, product pages and shop chrome all read the menu through `getStadiumMenu`, so their
 * cached pages carry `menu:<slug>` and go stale with it: the next visit still gets the static shell and the page
 * regenerates in the background. `revalidatePath` would *expire* those pages instead, and an expired `/[locale]/arena`
 * is never rebuilt: every later visit gets the generic `[stadium]` fallback shell, without the menu, until a redeploy.
 */
export function revalidateStadiumShop(slug: string) {
  revalidateTag(MENU_TAG(slug), "max");
}

/** Mark the venue list stale (home page, sitemap). Tag only, for the same reason as {@link revalidateStadiumShop}. */
export function revalidateStadiumList() {
  revalidateTag(STADIUMS_TAG, "max");
}
