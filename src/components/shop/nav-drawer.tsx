"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "@/i18n/navigation";
import { Drawer } from "@heroui/react";
import { ChevronRight, Download, Globe, LifeBuoy, Receipt, Share, Store } from "lucide-react";
import { FlagIcon } from "@/components/i18n/flag-icon";
import { currencyFlag } from "@/lib/flag-codes";
import { useTranslations } from "next-intl";
import { LanguageField } from "@/components/i18n/language-field";
import { useToast } from "@/components/toast/toast-provider";
import { useInstallPrompt } from "@/lib/hooks/use-install-prompt";
import { shareLink } from "@/lib/pwa/share";

type Props = {
  stadiumSlug: string;
  currency: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

const NAV = [
  { href: (slug: string) => `/${slug}/orders`, label: "orders", hint: "ordersHint", icon: Receipt },
  { href: (slug: string) => `/${slug}/support`, label: "support", hint: "supportHint", icon: LifeBuoy },
] as const;

/** Right-edge menu: history, support, and the saved language. */
export function NavDrawer({ stadiumSlug, currency, isOpen, onOpenChange }: Props) {
  const t = useTranslations("shop");
  const status = useTranslations("status");
  const language = useTranslations("language");
  const pwa = useTranslations("pwa");
  const { toast } = useToast();
  const installer = useInstallPrompt();
  const pathname = usePathname();
  const shopHref = `/${stadiumSlug}`;

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog
          aria-label={t("menu")}
          className="h-full max-h-none w-[min(22rem,100%)] rounded-none pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:rounded-l-[20px]"
        >
          <Drawer.CloseTrigger />
          <Drawer.Header>
            <Drawer.Heading>{t("menu")}</Drawer.Heading>
          </Drawer.Header>

          <Drawer.Body className="flex flex-col gap-8">
            <nav className="flex flex-col">
              <NavLink href={shopHref} label={t("shop")} hint={t("shopHint")} icon={Store} active={pathname === shopHref} />
              {NAV.map((item) => {
                const href = item.href(stadiumSlug);
                return (
                  <NavLink
                    key={href}
                    href={href}
                    label={t(item.label)}
                    hint={t(item.hint)}
                    icon={item.icon}
                    active={pathname === href || pathname.startsWith(`${href}/`)}
                  />
                );
              })}
              <ActionRow
                label={pwa("shareMenu")}
                hint={pwa("shareMenuHint")}
                icon={Share}
                onPress={async () => {
                  const result = await shareLink(shopHref, pwa("shareMenu"));
                  if (result === "copied") toast({ message: pwa("copied"), status: "success" });
                  if (result === "failed") toast({ message: pwa("shareFailed"), status: "error" });
                }}
              />
              {installer.canInstall ? (
                <ActionRow label={pwa("install")} hint={pwa("installHint")} icon={Download} onPress={() => void installer.install()} />
              ) : null}
            </nav>

            <section aria-label={t("preferences")}>
              <p className="px-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{t("preferences")}</p>
              <div className="mt-1 flex items-center gap-3 px-3 py-2">
                <Globe className="size-4 shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
                <span className="min-w-0 flex-1 text-[15px] font-medium">{language("label")}</span>
                <LanguageField tone="shop" align="end" className="shrink-0" />
              </div>
              <ul>
                {currency ? <CurrencyRow label={t("currency")} value={currency} hint={t("currencyHint")} /> : null}
                <li className="flex gap-4 px-3 py-2 text-[13px]">
                  <Link href="/privacy" className="font-medium text-link">
                    {t("privacy")}
                  </Link>
                  <Link href="/terms" className="font-medium text-link">
                    {t("terms")}
                  </Link>
                  <Link href="/status" className="font-medium text-link">
                    {status("title")}
                  </Link>
                </li>
              </ul>
            </section>
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

function NavLink({ href, label, hint, icon: Icon, active }: { href: string; label: string; hint: string; icon: typeof Store; active: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Link
      href={href}
      prefetch
      onClick={(e) => {
        e.preventDefault();
        if (href !== pathname) router.push(href);
      }}
      aria-current={active ? "page" : undefined}
      className={["flex items-center justify-between gap-3 rounded-2xl px-3 py-3 transition-colors", active ? "bg-surface-secondary" : "hover:bg-default"].join(
        " ",
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="size-4 shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
        <span>
          <span className="block text-[15px] font-medium">{label}</span>
          <span className="block text-[13px] text-muted">{hint}</span>
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted" strokeWidth={2} aria-hidden />
    </Link>
  );
}

function ActionRow({ label, hint, icon: Icon, onPress }: { label: string; hint: string; icon: typeof Store; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-default">
      <Icon className="size-4 shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </span>
    </button>
  );
}

function CurrencyRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <FlagIcon code={currencyFlag(value)} className="text-[15px]" title={value} />
        <span>
          <span className="block text-[15px] font-medium">{label}</span>
          <span className="block text-[13px] text-muted">{hint}</span>
        </span>
      </span>
      <span className="text-[13px] font-medium tabular-nums text-muted">{value}</span>
    </li>
  );
}
