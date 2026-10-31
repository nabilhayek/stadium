import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withWorkflow } from "workflow/next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const dev = process.env.NODE_ENV !== "production";
const preview = process.env.VERCEL_ENV === "preview";

/**
 * Inline scripts stay allowed: nonces would force every page to render per
 * request, and the shop is prerendered for match-day load. Everything else is
 * locked to this origin plus Stripe. Sentry goes through the /monitoring tunnel.
 */
const csp = [
  ["default-src", "'self'"],
  [
    "script-src",
    "'self'",
    "'unsafe-inline'",
    "https://js.stripe.com",
    "https://*.js.stripe.com",
    // Speed Insights loads from /_vercel on deployments, from its CDN in dev.
    ...(dev ? ["'unsafe-eval'", "https://va.vercel-scripts.com"] : []),
    ...(preview ? ["https://vercel.live"] : []),
  ],
  ["style-src", "'self'", "'unsafe-inline'"],
  [
    "img-src",
    "'self'",
    "data:",
    "blob:",
    "https://*.public.blob.vercel-storage.com",
    "https://*.stripe.com",
    ...(preview ? ["https://vercel.live", "https://vercel.com"] : []),
  ],
  ["font-src", "'self'", "data:", ...(preview ? ["https://vercel.live"] : [])],
  [
    "connect-src",
    "'self'",
    "https://api.stripe.com",
    "https://*.public.blob.vercel-storage.com",
    ...(dev ? ["ws:"] : []),
    ...(preview ? ["https://vercel.live", "wss://ws-us3.pusher.com"] : []),
  ],
  ["frame-src", "https://js.stripe.com", "https://*.js.stripe.com", "https://hooks.stripe.com", ...(preview ? ["https://vercel.live"] : [])],
  ["worker-src", "'self'", "blob:"],
  ["manifest-src", "'self'"],
  ["object-src", "'none'"],
  ["base-uri", "'self'"],
  ["form-action", "'self'"],
  ["frame-ancestors", "'none'"],
  ...(dev ? [] : [["upgrade-insecure-requests"]]),
]
  .map((parts) => parts.join(" "))
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")' },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  cacheComponents: true,
  partialPrefetching: true,
  // Keep AGENTS.md pointed at the docs bundled with this Next.js version.
  agentRules: true,
  logging: {
    // Every browser console line, with its source file, lands in the dev terminal.
    browserToTerminal: true,
    fetches: { fullUrl: true, hmrRefreshes: true },
  },

  // Tree-shake barrel exports so importing `Button` doesn't pull the whole library.
  experimental: {
    // Dev server exposes routes, logs, and compile errors at /_next/mcp.
    mcpServer: true,
    optimizePackageImports: ["@heroui/react", "lucide-react"],
    // Pages live under app/[locale], so unmatched URLs need a 404 outside any layout.
    globalNotFound: true,
    // Lets src/lib/taint.ts mark server secrets so they can't be passed to the browser.
    taint: true,
    exposeTestingApiInProductionBuild: process.env.EXPOSE_TESTING_API === "1",
  },

  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
  },

  images: {
    // Serve modern formats; product photos are lazy-loaded by default via next/image.
    formats: ["image/avif", "image/webp"],
    // Small device set for a phone-first product; fewer variants = smaller srcset.
    deviceSizes: [360, 414, 640, 828],
    imageSizes: [64, 96, 128, 192],
    // Product photos uploaded from the kitchen desk.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/products/**" }],
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // A fan's checkout and receipts are private, even if someone shares the link.
      ...["/:stadium/:page(checkout|order|orders)/:rest*", "/:locale(sv|da|en)/:stadium/:page(checkout|order|orders)/:rest*"].map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
      {
        // The service worker must never be cached by the browser for long.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withSentryConfig(withWorkflow(withNextIntl(nextConfig)), {
  org: "inseat",
  project: "web",
  silent: !process.env.CI,
  // Phones on stadium wifi send events to this app, which forwards them to Sentry.
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  // No session replay anywhere. Tracing stays: the kitchen desk samples it.
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
