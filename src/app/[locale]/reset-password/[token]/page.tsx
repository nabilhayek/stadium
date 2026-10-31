import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { ResetPasswordForm } from "@/components/management/reset-password-form";

type Props = { params: Promise<{ locale: Locale; token: string }>; searchParams: Promise<{ callbackURL?: string }> };

export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "login" });
  return { title: t("resetTitle"), robots: { index: false, follow: false } };
}

export default async function ResetPasswordPage({ params, searchParams }: Props) {
  await connection();
  const { locale, token } = await params;
  const { callbackURL } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("login");
  const next = callbackURL?.startsWith("/") ? callbackURL : "/";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <h1 className="font-display text-[32px] font-semibold leading-[0.95] tracking-[-0.045em]">{t("resetTitle")}</h1>
      <ResetPasswordForm token={token} callbackURL={next} />
    </main>
  );
}
