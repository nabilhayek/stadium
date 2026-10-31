import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { api } from "@/server/trpc/server";

export const alt = "Order food and drinks to your seat";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card shown when a shop link is shared in a chat or on social media. */
export default async function Image({ params }: { params: Promise<{ locale: Locale; stadium: string }> }) {
  const { locale, stadium } = await params;
  const [menu, t] = await Promise.all([api.stadium.menu({ slug: stadium }).catch(() => null), getTranslations({ locale, namespace: "meta" })]);
  const name = menu?.name ?? t("title");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#0b0b0b",
        color: "#ffffff",
      }}
    >
      <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, textTransform: "uppercase", color: "#9a9a9a" }}>
        {menu?.city ? `${t("title")} · ${menu.city}` : t("title")}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: name.length > 18 ? 96 : 128, fontWeight: 700, lineHeight: 0.95, letterSpacing: -5 }}>{name}</div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 36, color: "#bdbdbd" }}>{t("description")}</div>
      </div>
    </div>,
    size,
  );
}
