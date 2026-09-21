import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Tree-shake barrel exports so importing `Button` doesn't pull the whole library.
  experimental: {
    optimizePackageImports: ["@heroui/react", "lucide-react"],
  },

  images: {
    // Serve modern formats; product photos are lazy-loaded by default via next/image.
    formats: ["image/avif", "image/webp"],
    // Small device set for a phone-first product; fewer variants = smaller srcset.
    deviceSizes: [360, 414, 640, 828],
    imageSizes: [64, 96, 128, 192],
  },

  async headers() {
    return [
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

export default nextConfig;
