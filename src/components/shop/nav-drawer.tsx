"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "@/i18n/navigation";
import { Drawer } from "@heroui/react";
import { ChevronRight, Coins, Globe, LifeBuoy, Receipt, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageField } from "@/components/i18n/language-field";

type Props = {
  stadiumSlug: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

const NAV = [
  { href: (slug: string) => `/${slug}/orders`, label: "orders", hint: "ordersHint", icon: Receipt },
  { href: (slug: string) => `/${slug}/support`, label: "support", hint: "supportHint", icon: LifeBuoy },
] as const;

/** Right-edge menu: history, support, and the saved language. */
export function NavDrawer({ stadiumSlug, isOpen, onOpenChange }: Props) {
  const t = useTranslations("shop");
  const language = useTranslations("language");
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
            </nav>

            <section aria-label={t("preferences")}>
              <p className="px-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{t("preferences")}</p>
              <div className="mt-2 rounded-2xl px-3 py-3">
                <span className="flex items-center gap-3">
                  <Globe className="size-4 shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
                  <span>
                    <span className="block text-[15px] font-medium">{language("label")}</span>
                    <span className="block text-[13px] text-muted">{language("hint")}</span>
                  </span>
                </span>
                <div className="mt-3">
                  <LanguageField tone="shop" />
                </div>
              </div>
              <ul>
                <ComingSoonRow label={t("currency")} value={t("currencyValue")} hint={t("comingSoon")} icon={Coins} />
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

function ComingSoonRow({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: typeof Store }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="size-4 shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
        <span>
          <span className="block text-[15px] font-medium">{label}</span>
          <span className="block text-[13px] text-muted">{hint}</span>
        </span>
      </span>
      <span className="text-[13px] text-muted">{value}</span>
    </li>
  );
}
