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
 * Drop the cached menu and the shop shells. Called from tRPC (a route handler),
 * so this uses `revalidateTag` — `updateTag` is only valid inside a Server Action.
 */
export function revalidateStadiumShop(slug: string) {
  revalidateTag(MENU_TAG(slug), "max");
  revalidateLocalized(`/${slug}`, "layout");
  revalidatePath("/[locale]/[stadium]", "layout");
  revalidatePath("/[locale]/[stadium]", "page");
  revalidatePath("/[locale]/[stadium]/product/[id]", "page");
}

export function revalidateStadiumList() {
  revalidateTag(STADIUMS_TAG, "max");
  revalidateLocalized("/", "layout");
}
