import "server-only";
import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, matchAcceptLanguage, type Locale } from "@/i18n/config";
import type { Receipt } from "@/lib/orders/receipt";
import { emailCopy, escapeHtml, fill } from "./copy";
import { renderEmail } from "./html";
import { appOrigin } from "./request-locale";
import { sendMail } from "./send";

const TAG: Record<Locale, string> = { sv: "sv-SE", da: "da-DK", en: "en-GB" };

export async function requestLocale(): Promise<Locale> {
  try {
    const saved = (await cookies()).get("locale")?.value;
    if (isLocale(saved)) return saved;
    return matchAcceptLanguage((await headers()).get("accept-language"));
  } catch {
    return defaultLocale;
  }
}

function money(cents: number, currency: string, locale: Locale) {
  return new Intl.NumberFormat(TAG[locale], { style: "currency", currency }).format(cents / 100);
}

/** Email the fan once an address is stored on a paid order. */
export async function sendReceiptEmail(receipt: Receipt, locale: Locale) {
  const to = receipt.email?.trim();
  if (!to) return { ok: true as const, skipped: true };
  const copy = emailCopy(locale);
  const total = money(receipt.totalCents ?? 0, receipt.currency ?? "EUR", locale);
  const seat = receipt.seat ? `${receipt.seat.sectionName} ${receipt.seat.row} ${receipt.seat.number}` : "";
  const lines = receipt.lines.map((line) => `${line.qty} × ${escapeHtml(line.name)}`).join("<br>");
  const vars = { order: receipt.orderNumber, stadium: receipt.stadiumName, total, code: receipt.confirmCode, seat, email: to };
  const paragraphs = [
    fill(copy.receipt.body, vars, "html"),
    lines,
    `<strong>${fill(copy.receipt.total, {}, "html")}</strong> ${fill("{total}", { total }, "html")}`,
    `<strong>${fill(copy.receipt.code, {}, "html")}</strong> ${fill("{code}", { code: receipt.confirmCode }, "html")}`,
  ];
  if (seat) paragraphs.push(`<strong>${fill(copy.receipt.seat, {}, "html")}</strong> ${fill("{seat}", { seat }, "html")}`);
  return sendMail({
    to,
    subject: fill(copy.receipt.subject, vars, "text"),
    html: renderEmail({
      locale,
      preheader: fill(copy.receipt.preheader, vars, "html"),
      heading: fill(copy.receipt.heading, vars, "html"),
      paragraphs,
      action: { href: `${appOrigin()}/${receipt.stadiumSlug}/order/${receipt.orderNumber}`, label: copy.receipt.action },
      footer: fill(copy.receipt.ignore, vars, "html"),
    }),
    idempotencyKey: `receipt/${receipt.stadiumSlug}/${receipt.orderNumber}/${to.toLowerCase()}`,
  });
}
