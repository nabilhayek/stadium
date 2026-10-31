import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/** Shops are public. The kitchen desk, orders and APIs are not for search engines. */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/monitoring", "/*/management", "/*/checkout", "/*/order", "/*/orders"],
    },
    sitemap: new URL("/sitemap.xml", base).toString(),
  };
}
