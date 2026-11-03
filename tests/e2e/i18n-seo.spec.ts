import { test, expect } from "../support/e2e/fixtures";

test.describe("crawlers and SEO headers", () => {
  test("robots.txt allows the shop, hides private routes and links the sitemap", async ({ request, baseURL }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /api/");
    expect(body).toContain("Disallow: /*/management");
    expect(body).toContain("Disallow: /*/checkout");
    expect(body).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
    expect(baseURL).toBeTruthy();
  });

  test("sitemap.xml lists the seeded arena shop with its language alternates", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("xml");
    const body = await res.text();
    expect(body).toContain("<urlset");
    expect(body).toMatch(/<loc>[^<]*\/arena<\/loc>/);
    expect(body).toMatch(/hreflang="sv"[^>]*href="[^"]*\/sv\/arena"/);
  });

  test("the public shop is indexable", async ({ request }) => {
    const res = await request.get("/arena");
    expect(res.status()).toBe(200);
    expect(res.headers()["x-robots-tag"]).toBeUndefined();
  });

  test("checkout is marked noindex", async ({ request }) => {
    const res = await request.get("/arena/checkout", { maxRedirects: 0 });
    expect(res.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });

  test("security headers are sent on the shop", async ({ request }) => {
    const headers = (await request.get("/arena")).headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  test("unknown shops are not found and never indexed", async ({ request }) => {
    // Shop pages stream a static shell first (Cache Components), so an unknown venue is a soft 404: Next.js can't
    // change the status once streaming starts, and injects a noindex robots tag with the not-found page instead.
    const shop = await (await request.get("/nope")).text();
    expect(shop).toMatch(/<meta name="robots" content="noindex"/);
    expect(shop).toContain("<title>Not found");

    const checkout = await (await request.get("/nope/checkout")).text();
    expect(checkout).toMatch(/<meta name="robots" content="noindex"/);
  });
});

test.describe("language", () => {
  test("the saved locale picks the language of /arena", async ({ page }) => {
    await page.goto("/arena");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("an explicit /sv/arena pins Swedish", async ({ page }) => {
    await page.goto("/sv/arena");
    await expect(page.locator("html")).toHaveAttribute("lang", "sv");
  });
});
