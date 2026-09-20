import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Seat Service",
    short_name: "Seat Service",
    description: "Food and drinks delivered to your seat.",
    start_url: "/",
    // Fans land on /[stadium] from a QR code; keep them in the installed app for the whole flow.
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#090909",
    theme_color: "#090909",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
