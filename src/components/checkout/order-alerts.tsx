"use client";

import { useMemo } from "react";
import { m } from "framer-motion";
import { Bell, Download, Share } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { PillButton } from "@/components/ui/pill-button";
import { fadeUp } from "@/components/motion/variants";
import { useToast } from "@/components/toast/toast-provider";
import { useHoldInstallPrompt, useInstallPrompt } from "@/lib/hooks/use-install-prompt";
import { useWebPush, type PushTarget } from "@/lib/hooks/use-web-push";
import { isLocale } from "@/i18n/config";
import type { Receipt } from "@/lib/orders/receipt";
import { shareLink } from "@/lib/pwa/share";
import { trpc } from "@/lib/trpc/client";

/** Saved once; every later order on this phone follows automatically. */
export const ORDER_ALERTS_KEY = "push:orders:v1";

/** Notifications for this order, plus installing the app and sharing the order link. */
export function OrderAlerts({ receipt }: { receipt: Receipt }) {
  const t = useTranslations("pwa");
  const localeValue = useLocale();
  const locale = isLocale(localeValue) ? localeValue : "en";
  const { toast } = useToast();
  const { stadiumSlug, orderNumber, token } = receipt;

  const target = useMemo<PushTarget | null>(
    () =>
      token
        ? {
            key: ORDER_ALERTS_KEY,
            attach: async (subscription) => (await trpc.push.followOrder.mutate({ stadium: stadiumSlug, orderNumber, token, locale, subscription })).ok,
            detach: async (endpoint) => {
              await trpc.push.unfollowOrder.mutate({ orderNumber, endpoint });
            },
          }
        : null,
    [stadiumSlug, orderNumber, token, locale],
  );
  const push = useWebPush(target);
  useHoldInstallPrompt();
  const installer = useInstallPrompt();

  const finished = receipt.kitchenStatus === "done";
  const showPush = !finished && target && (push.supported || push.needsInstall);

  async function share() {
    const result = await shareLink(`/${stadiumSlug}/order/${orderNumber}`, `${receipt.stadiumName} · ${orderNumber}`);
    if (result === "copied") toast({ message: t("copied"), status: "success" });
    if (result === "failed") toast({ message: t("shareFailed"), status: "error" });
  }

  return (
    <>
      {showPush ? (
        <m.section variants={fadeUp} className="rounded-[20px] border border-border bg-surface p-5" aria-label={t("alertsTitle")}>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-secondary">
              <Bell className="size-5" strokeWidth={1.7} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium">{t("alertsTitle")}</p>
              <p className="mt-1 text-[13px] leading-snug text-muted">
                {push.needsInstall ? t("iosInstall") : push.permission === "denied" ? t("blocked") : push.subscribed ? t("alertsOn") : t("alertsHint")}
              </p>
            </div>
          </div>
          {push.supported && push.permission !== "denied" ? (
            <div className="mt-4">
              {push.subscribed ? (
                <PillButton size="md" variant="secondary" fullWidth disabled={push.busy} onClick={() => void push.unsubscribe()}>
                  {t("turnOff")}
                </PillButton>
              ) : (
                <PillButton
                  size="md"
                  variant="primary"
                  fullWidth
                  disabled={push.busy}
                  onClick={async () => {
                    const ok = await push.subscribe();
                    if (!ok && Notification.permission === "granted") toast({ message: t("failed"), status: "error" });
                  }}
                >
                  {t("turnOn")}
                </PillButton>
              )}
            </div>
          ) : null}
        </m.section>
      ) : null}

      <m.div variants={fadeUp} className="flex gap-2">
        {installer.canInstall ? (
          <PillButton size="md" variant="secondary" className="flex-1" onClick={() => void installer.install()}>
            <Download className="size-4" strokeWidth={2} aria-hidden />
            {t("install")}
          </PillButton>
        ) : null}
        <PillButton size="md" variant="secondary" className="flex-1" onClick={() => void share()}>
          <Share className="size-4" strokeWidth={2} aria-hidden />
          {t("shareOrder")}
        </PillButton>
      </m.div>
    </>
  );
}
