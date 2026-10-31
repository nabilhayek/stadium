import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";
import { siteUrl } from "@/lib/site-url";
import { api } from "@/server/trpc/server";

/** Every active shop. /arena follows the visitor's language; /sv/arena and friends pin one. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const url = (path: string) => new URL(path, base).toString();
  const stadiums = await api.stadium.active().catch(() => []);

  return [
    { url: url("/"), changeFrequency: "weekly", priority: 0.5 },
    ...stadiums.map((s) => ({
      url: url(`/${s.slug}`),
      changeFrequency: "daily" as const,
      priority: 1,
      alternates: { languages: Object.fromEntries(locales.map((locale) => [locale, url(`/${locale}/${s.slug}`)])) },
    })),
  ];
}
