import "server-only";
import { revalidateTag } from "next/cache";
import { locales } from "@/i18n/config";
import { later } from "@/lib/push/later";
import { MENU_TAG, STADIUMS_TAG } from "@/lib/queries/stadium";
import { siteUrl } from "@/lib/site-url";

/**
 * Mark the cached menu stale and rebuild the shop right away. Called from tRPC (a route handler), so this uses
 * `revalidateTag`; `updateTag` is only valid inside a Server Action.
 *
 * Tag only, on purpose. The shop, product pages and shop chrome all read the menu through `getStadiumMenu`, so their
 * cached pages carry `menu:<slug>` and go stale with it: the next visit still gets the static shell and the page
 * regenerates in the background. Expiring instead (`revalidatePath`, or `revalidateTag` with `{ expire: 0 }`) means an
 * expired `/[locale]/arena` is never rebuilt: every later visit gets the generic `[stadium]` fallback shell, without the
 * menu, until a redeploy.
 *
 * Stale-while-revalidate hands the old menu to the first visitor after an edit, so the server makes that first visit
 * itself, once the response is out. Fans then get the new menu from the next load.
 */
export function revalidateStadiumShop(slug: string) {
  revalidateTag(MENU_TAG(slug), "max");
  void later(() => warm(locales.map((locale) => `/${locale}/${slug}`)));
}

/** Mark the venue list stale (home page, sitemap). Tag only, for the same reason as {@link revalidateStadiumShop}. */
export function revalidateStadiumList() {
  revalidateTag(STADIUMS_TAG, "max");
}

/** The deployment serving this request, so a preview warms itself and not production. */
function ownOrigin() {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return siteUrl().origin;
}

/** Request each page once so a stale cached copy starts regenerating now, not on a fan's visit. */
async function warm(paths: string[]) {
  const origin = ownOrigin();
  await Promise.all(
    paths.map((path) =>
      fetch(new URL(path, origin), { cache: "no-store", signal: AbortSignal.timeout(10_000) })
        .then((res) => res.body?.cancel())
        .catch(() => undefined),
    ),
  );
}
