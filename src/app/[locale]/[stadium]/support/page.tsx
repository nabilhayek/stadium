import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { api } from "@/server/trpc/server";
import { BackLink } from "@/components/ui/back-link";

type Props = { params: Promise<{ stadium: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium } = await params;
  const menu = await api.stadium.menu({ slug: stadium });
  const t = await getTranslations("support");
  if (!menu) return { title: t("title") };
  return { title: `${t("title")} · ${menu.name}`, description: t("description", { name: menu.name }) };
}

export default function SupportPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <SupportBody {...props} />
    </Suspense>
  );
}

async function SupportBody({ params }: Props) {
  const { stadium: slug } = await params;
  const menu = await api.stadium.menu({ slug });
  if (!menu) notFound();
  const t = await getTranslations("support");

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6 pb-16">
      <header className="pr-12">
        <BackLink href={`/${menu.slug}`}>{t("back")}</BackLink>
        <h1 className="font-display mt-3 text-[28px] font-semibold leading-none tracking-[-0.03em]">{t("title")}</h1>
        <p className="mt-2 text-[15px] text-muted">{menu.name}</p>
      </header>

      <ul className="mt-6 flex flex-col gap-2">
        {(
          [
            ["whereTitle", "whereBody"],
            ["seatTitle", "seatBody"],
            ["payTitle", "payBody"],
            ["allergyTitle", "allergyBody"],
          ] as const
        ).map(([title, body]) => (
          <li key={title} className="rounded-[20px] border border-border bg-surface px-5 py-4">
            <h2 className="text-[15px] font-medium">{t(title)}</h2>
            <p className="mt-1 text-[13px] leading-snug text-muted">{t(body)}</p>
          </li>
        ))}
      </ul>

      <a href="mailto:support@seatize.com" className="button button--secondary button--lg mt-6 w-full text-center">
        {t("email")}
      </a>
    </main>
  );
}
