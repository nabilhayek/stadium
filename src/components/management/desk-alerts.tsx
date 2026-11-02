"use client";

import { useMemo } from "react";
import { Bell, BellOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { isLocale } from "@/i18n/config";
import { useToast } from "@/components/toast/toast-provider";
import { useWebPush, type PushTarget } from "@/lib/hooks/use-web-push";
import { useTRPC } from "@/lib/trpc/react";

/** New-order notifications on this device for the signed-in desk user. Hidden where push isn't available. */
export function DeskAlerts({ stadiumSlug }: { stadiumSlug: string }) {
  const t = useTranslations("pwa");
  const localeValue = useLocale();
  const locale = isLocale(localeValue) ? localeValue : "en";
  const { toast } = useToast();
  const trpc = useTRPC();
  const { mutateAsync: follow } = useMutation(trpc.push.followDesk.mutationOptions());
  const { mutateAsync: unfollow } = useMutation(trpc.push.unfollowDesk.mutationOptions());

  const target = useMemo<PushTarget>(
    () => ({
      key: `push:desk:v1:${stadiumSlug}`,
      attach: async (subscription) => (await follow({ stadium: stadiumSlug, locale, subscription })).ok,
      detach: async (endpoint) => {
        await unfollow({ endpoint });
      },
    }),
    [stadiumSlug, locale, follow, unfollow],
  );
  const push = useWebPush(target);
  if (!push.supported && !push.needsInstall) return null;

  const blocked = push.permission === "denied";
  const Icon = push.subscribed ? Bell : BellOff;
  const hint = push.needsInstall ? t("iosInstall") : blocked ? t("blocked") : t("deskAlertsHint");

  return (
    <button
      type="button"
      role="switch"
      aria-checked={push.subscribed}
      disabled={push.busy || blocked || push.needsInstall || !push.supported}
      title={hint}
      onClick={async () => {
        if (push.subscribed) return push.unsubscribe();
        const ok = await push.subscribe();
        if (!ok && Notification.permission === "granted") toast({ message: t("failed"), status: "error" });
      }}
      className={[
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-50",
        push.subscribed ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
      ].join(" ")}
    >
      <Icon className="size-4" strokeWidth={1.8} aria-hidden />
      {t("deskAlerts")}
    </button>
  );
}
