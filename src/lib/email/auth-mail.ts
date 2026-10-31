import "server-only";
import type { Locale } from "@/i18n/config";
import { emailCopy, fill } from "./copy";
import { renderEmail } from "./html";
import { appOrigin, localeFromRequest } from "./request-locale";
import { sendMail } from "./send";

export async function sendPasswordResetEmail(opts: { to: string; url: string; request?: Request | null }) {
  const locale = localeFromRequest(opts.request);
  const copy = emailCopy(locale);
  const vars = { email: opts.to };
  return sendMail({
    to: opts.to,
    subject: fill(copy.reset.subject, vars, "text"),
    html: renderEmail({
      locale,
      preheader: fill(copy.reset.preheader, vars, "html"),
      heading: fill(copy.reset.heading, vars, "html"),
      paragraphs: [fill(copy.reset.body, vars, "html")],
      action: { href: opts.url, label: copy.reset.action },
      footer: fill(copy.reset.ignore, vars, "html"),
    }),
    idempotencyKey: `password-reset/${opts.url}`,
  });
}

export async function sendVerificationEmail(opts: { to: string; url: string; request?: Request | null }) {
  const locale = localeFromRequest(opts.request);
  const copy = emailCopy(locale);
  const vars = { email: opts.to };
  return sendMail({
    to: opts.to,
    subject: fill(copy.verify.subject, vars, "text"),
    html: renderEmail({
      locale,
      preheader: fill(copy.verify.preheader, vars, "html"),
      heading: fill(copy.verify.heading, vars, "html"),
      paragraphs: [fill(copy.verify.body, vars, "html")],
      action: { href: opts.url, label: copy.verify.action },
      footer: fill(copy.verify.ignore, vars, "html"),
    }),
    idempotencyKey: `verify-email/${opts.url}`,
  });
}

export function loginUrl(stadiumSlug: string) {
  return `${appOrigin()}/${stadiumSlug}/management/login`;
}
