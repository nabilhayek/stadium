"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Drawer } from "@heroui/react";
import { ChevronRight, Coins, Globe, LifeBuoy, Receipt, Store } from "lucide-react";

type Props = {
  stadiumSlug: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

const NAV = [
  { href: (slug: string) => `/${slug}/orders`, label: "Order history", hint: "Past receipts", icon: Receipt },
  { href: (slug: string) => `/${slug}/support`, label: "Support", hint: "Help with an order", icon: LifeBuoy },
] as const;

/** Right-edge menu: history, support, and language/currency placeholders. */
export function NavDrawer({ stadiumSlug, isOpen, onOpenChange }: Props) {
  const pathname = usePathname();
  const shopHref = `/${stadiumSlug}`;

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog
          aria-label="Menu"
          className="h-full max-h-none w-[min(22rem,100%)] rounded-none pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:rounded-l-[20px]"
        >
          <Drawer.CloseTrigger />
          <Drawer.Header>
            <Drawer.Heading>Menu</Drawer.Heading>
          </Drawer.Header>

          <Drawer.Body className="flex flex-col gap-8">
            <nav className="flex flex-col">
              <NavLink
                href={shopHref}
                label="Shop"
                hint="Order to your seat"
                icon={Store}
                active={pathname === shopHref}
              />
              {NAV.map((item) => {
                const href = item.href(stadiumSlug);
                return (
                  <NavLink
                    key={href}
                    href={href}
                    label={item.label}
                    hint={item.hint}
                    icon={item.icon}
                    active={pathname === href || pathname.startsWith(`${href}/`)}
                  />
                );
              })}
            </nav>

            <section aria-label="Preferences">
              <p className="px-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                Preferences
              </p>
              <ul className="mt-2">
                <ComingSoonRow label="Language" value="English" icon={Globe} />
                <ComingSoonRow label="Currency" value="Venue default" icon={Coins} />
              </ul>
            </section>
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

function NavLink({
  href,
  label,
  hint,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  hint: string;
  icon: typeof Store;
  active: boolean;
}) {
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
      className={[
        "flex items-center justify-between gap-3 rounded-2xl px-3 py-3 transition-colors",
        active ? "bg-surface-secondary" : "hover:bg-default",
      ].join(" ")}
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

function ComingSoonRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Store;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="size-4 shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
        <span>
          <span className="block text-[15px] font-medium">{label}</span>
          <span className="block text-[13px] text-muted">Coming soon</span>
        </span>
      </span>
      <span className="text-[13px] text-muted">{value}</span>
    </li>
  );
}
