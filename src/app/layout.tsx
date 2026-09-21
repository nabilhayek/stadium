import type { Metadata, Viewport } from "next";
import { DM_Sans, Instrument_Sans } from "next/font/google";
import { SwRegister } from "@/components/pwa/sw-register";
import { MotionProvider } from "@/components/motion/motion";
import "./globals.css";

const display = Instrument_Sans({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display-face",
  display: "swap",
});

const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-face",
  display: "swap",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: "Seat Service", template: "%s · Seat Service" },
  description: "Food and drinks delivered to your seat.",
  applicationName: "Seat Service",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Seat Service" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f4f1",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`${display.variable} ${sans.variable}`}>
      <body className="bg-background text-foreground">
        <MotionProvider>{children}</MotionProvider>
        <SwRegister />
      </body>
    </html>
  );
}
