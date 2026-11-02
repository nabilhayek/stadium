import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { LocaleBoot } from "@/components/i18n/locale-boot";
import { SwRegister } from "@/components/pwa/sw-register";
import { MotionProvider } from "@/components/motion/motion";
import { ToastProvider } from "@/components/toast/toast-provider";
import { isLocale, locales } from "@/i18n/config";
import { siteUrl } from "@/lib/site-url";
import { taintSecrets } from "@/lib/taint";
import { TRPCReactProvider } from "@/lib/trpc/react";
import "../globals.css";

const display = localFont({
  src: "../../fonts/instrument-sans-latin.woff2",
  weight: "600 700",
  variable: "--font-display-face",
  display: "swap",
});

const sans = localFont({
  src: "../../fonts/dm-sans-latin.woff2",
  weight: "400 700",
  variable: "--font-sans-face",
  display: "swap",
});

taintSecrets();

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  const title = t("title");
  return {
    // A string, not a URL: cached metadata has to be serializable.
    metadataBase: siteUrl().origin,
    title: { default: title, template: `%s · ${title}` },
    description: t("description"),
    applicationName: title,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title },
    formatDetection: { telephone: false },
    icons: {
      icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#f4f4f1",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** The proxy picks the language and rewrites here, so each language is its own static page. */
export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} data-locale={locale} data-theme="light" className={`${display.variable} ${sans.variable}`}>
      <body className="bg-background text-foreground">
        <LocaleBoot />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TRPCReactProvider>
            <MotionProvider>
              <ToastProvider>{children}</ToastProvider>
            </MotionProvider>
          </TRPCReactProvider>
        </NextIntlClientProvider>
        <SwRegister />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
