"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Props = {
  error: Error & { digest?: string };
  retry: () => void;
  tone: "shop" | "desk";
  /** Where "Back to the menu" goes; omitted on the desk. */
  homeHref?: string;
};

/** Shared body for route `error.tsx` files: reports to Sentry, then offers a retry. */
export function RouteError({ error, retry, tone, homeHref }: Props) {
  const t = useTranslations("error");
  const shop = tone === "shop";

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div role="alert" className={cn("mx-auto flex w-full max-w-md flex-col items-start", shop ? "min-h-[70dvh] justify-center px-4" : "py-16")}>
      <h1 className={cn("font-display font-semibold leading-tight tracking-[-0.02em]", shop ? "text-[28px]" : "text-[22px]")}>{t("title")}</h1>
      <p className={cn("mt-2 text-[15px]", shop ? "text-muted" : "text-neutral-500")}>{shop ? t("shopBody") : t("deskBody")}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={retry}
          className={cn(
            "min-h-11 rounded-full px-5 text-[14px] font-medium",
            shop ? "bg-foreground text-background" : "bg-neutral-900 text-white hover:bg-neutral-800",
          )}
        >
          {t("retry")}
        </button>
        {homeHref ? (
          <Link href={homeHref} className="inline-flex min-h-11 items-center rounded-full bg-surface-secondary px-5 text-[14px] font-medium text-foreground">
            {t("home")}
          </Link>
        ) : null}
      </div>
      {error.digest ? <p className={cn("mt-6 text-[12px]", shop ? "text-muted" : "text-neutral-400")}>Ref {error.digest}</p> : null}
    </div>
  );
}
