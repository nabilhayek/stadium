import en from "../../../messages/en.json";
import sv from "../../../messages/sv.json";
import da from "../../../messages/da.json";
import type { Locale } from "@/i18n/config";

const catalogs = { en, sv, da } as const;

export type EmailCopy = (typeof en)["email"];

export function emailCopy(locale: Locale): EmailCopy {
  return catalogs[locale].email;
}

/** Replace `{name}` placeholders. HTML values are escaped so a name can't break the message. */
export function fill(template: string, vars: Record<string, string>, mode: "text" | "html"): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key] ?? "";
    return mode === "html" ? escapeHtml(value) : value;
  });
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
