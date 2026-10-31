"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { LanguageField } from "@/components/i18n/language-field";
import { AlertTriangle, ArrowUpRight, LayoutGrid, LogOut, Map as MapIcon, Package, ReceiptText, Search, Settings2 } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import type { BoardStatus } from "@/lib/management/board";
import { cn } from "@/lib/utils";

type Props = {
  stadiumSlug: string;
  stadiumName: string;
  email: string;
  board: Record<BoardStatus, number>;
  waiting: number;
  children: ReactNode;
};

const BOARD_ROWS: { id: BoardStatus; label: "new" | "inProgress" | "ready"; dot: string }[] = [
  { id: "new", label: "new", dot: "bg-blue-500" },
  { id: "accepted", label: "inProgress", dot: "bg-amber-500" },
  { id: "ready", label: "ready", dot: "bg-green-500" },
];

export function DeskShell({ stadiumSlug, stadiumName, email, board, waiting, children }: Props) {
  const t = useTranslations("desk");
  const pathname = usePathname();
  const base = `/${stadiumSlug}/management`;
  const orders = `${base}/orders`;
  const products = `${base}/products`;
  const seatMap = `${base}/seat-map`;
  const admin = `${base}/admin`;
  const onOrders = pathname.startsWith(orders);
  const onProducts = pathname.startsWith(products);
  const onSeatMap = pathname.startsWith(seatMap);
  const onAdmin = pathname.startsWith(admin);
  const page = onOrders ? "orders" : onProducts ? "products" : onSeatMap ? "seatMap" : onAdmin ? "admin" : "overview";

  return (
    <div className="flex min-h-dvh bg-white text-neutral-900">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-neutral-200 px-4">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-neutral-900 text-[13px] font-semibold text-white">
            {stadiumName.charAt(0)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[14px] font-semibold leading-tight">{stadiumName}</span>
            <span className="text-[12px] leading-tight text-neutral-500">{t("kitchen")}</span>
          </span>
        </div>

        {onSeatMap || onAdmin ? null : (
          <div className="px-3 pt-3">
            <FindOrder
              key={onProducts ? "products" : "orders"}
              label={onProducts ? t("findProduct") : t("findOrder")}
              name={onProducts ? t("findProductLabel") : t("findOrderLabel")}
            />
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 pt-4" aria-label={t("kitchen")}>
          <ul className="flex flex-col gap-0.5">
            <NavLink href={base} icon={<LayoutGrid className="size-4" />} exact>
              {t("overview")}
            </NavLink>
            <NavLink href={orders} icon={<ReceiptText className="size-4" />}>
              {t("orders")}
            </NavLink>
            <NavLink href={products} icon={<Package className="size-4" />}>
              {t("products")}
            </NavLink>
            <NavLink href={seatMap} icon={<MapIcon className="size-4" />}>
              {t("seatMap")}
            </NavLink>
            <NavLink href={admin} icon={<Settings2 className="size-4" />}>
              {t("admin")}
            </NavLink>
          </ul>

          <h2 className="mt-6 mb-1 px-2 text-[12px] font-medium text-neutral-500">{t("board")}</h2>
          <ul className="flex flex-col gap-0.5">
            {BOARD_ROWS.map((row) => (
              <li key={row.id}>
                <Link
                  href={`${orders}#column-${row.id}`}
                  className="flex h-8 items-center gap-2.5 rounded-lg px-2 text-[14px] text-neutral-600 transition-colors duration-150 hover:bg-neutral-200/60 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  <span className={cn("ml-1 size-2 rounded-full", row.dot)} aria-hidden />
                  {t(row.label)}
                  <span className="ml-auto text-[13px] tabular-nums text-neutral-500">{board[row.id]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-3 p-3">
          <Attention waiting={waiting} href={orders} />
          <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3">
            <LanguageField tone="desk" />
            <Account email={email} loginHref={`${base}/login`} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 backdrop-blur md:px-6">
          <nav aria-label="Breadcrumb" className="hidden min-w-0 sm:block">
            <ol className="flex items-center gap-1.5 text-[14px] whitespace-nowrap">
              <li className="truncate text-neutral-500 lg:hidden">{stadiumName}</li>
              <li className="hidden text-neutral-500 lg:block">{t("kitchen")}</li>
              <li aria-hidden className="text-neutral-300">
                /
              </li>
              <li aria-current="page" className="font-medium">
                {t(page)}
              </li>
            </ol>
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <nav aria-label={t("kitchen")} className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] lg:hidden">
              <MobileTab href={base} active={page === "overview"}>
                {t("overview")}
              </MobileTab>
              <MobileTab href={orders} active={onOrders}>
                {t("orders")}
              </MobileTab>
              <MobileTab href={products} active={onProducts}>
                {t("products")}
              </MobileTab>
              <MobileTab href={seatMap} active={onSeatMap}>
                {t("seatMap")}
              </MobileTab>
              <MobileTab href={admin} active={onAdmin}>
                {t("admin")}
              </MobileTab>
            </nav>
            <div className="lg:hidden">
              <LanguageField tone="desk" layout="select" />
            </div>
            {onProducts ? (
              <a
                href={`/${stadiumSlug}`}
                target="_blank"
                rel="noreferrer"
                className="hidden h-8 items-center gap-1.5 rounded-full border border-neutral-200 px-3 text-[13px] font-medium text-neutral-700 transition-colors duration-150 hover:bg-neutral-50 sm:inline-flex"
              >
                {t("viewShop")}
                <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            ) : onSeatMap || onAdmin ? null : onOrders ? (
              <span className="hidden items-center gap-2 rounded-full border border-neutral-200 px-3 py-1 text-[13px] font-medium text-neutral-700 sm:inline-flex">
                <span className="relative size-2 rounded-full bg-green-500">
                  <span className="absolute inset-0 rounded-full bg-green-500 opacity-60 [animation:ping_1.8s_ease-out_infinite] motion-reduce:hidden" />
                </span>
                {t("live")}
              </span>
            ) : (
              <Link
                href={orders}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-900! px-3.5 text-[13px] font-medium text-white! transition-colors duration-150 hover:bg-neutral-700! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                {t("openBoard")}
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            )}
          </div>
        </header>
        {onSeatMap ? (
          <main className="min-w-0 flex-1">{children}</main>
        ) : (
          <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 md:px-6">{children}</main>
        )}
      </div>
    </div>
  );
}

function MobileTab({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150",
        active ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:text-neutral-900",
      )}
    >
      {children}
    </Link>
  );
}

function NavLink({ href, icon, exact, children }: { href: string; icon: ReactNode; exact?: boolean; children: string }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-8 items-center gap-2.5 rounded-lg px-2 text-[14px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-500",
          active ? "bg-neutral-200/70 font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900",
        )}
      >
        <span className={active ? "text-neutral-900" : "text-neutral-500"}>{icon}</span>
        {children}
      </Link>
    </li>
  );
}

/** Filters the current list through `?q=` without a server round-trip. */
function FindOrder({ label, name }: { label: string; name: string }) {
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "f" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      input.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function update(value: string) {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set("q", value);
    else next.delete("q");
    const query = next.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }

  return (
    <label className="flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 transition-[border-color,box-shadow] duration-150 focus-within:border-blue-500 focus-within:ring-3 focus-within:ring-blue-500/15">
      <Search className="size-4 shrink-0 text-neutral-400" aria-hidden />
      <input
        ref={input}
        type="search"
        defaultValue={params.get("q") ?? ""}
        onChange={(e) => update(e.target.value.trim())}
        placeholder={label}
        aria-label={name}
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-neutral-400"
      />
      <kbd className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 text-[11px] leading-5 text-neutral-500">F</kbd>
    </label>
  );
}

function Attention({ waiting, href }: { waiting: number; href: string }) {
  const t = useTranslations("desk");
  if (waiting === 0) return null;
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
      <p className="flex items-center gap-2 text-[13px] font-medium text-orange-900">
        <AlertTriangle className="size-4 text-orange-500" aria-hidden />
        {t("actionRequired")}
      </p>
      <p className="mt-1 text-[13px] leading-snug text-orange-800">{t("waiting", { count: waiting })}</p>
      <Link
        href={href}
        className="mt-2.5 flex h-8 items-center justify-center rounded-full bg-orange-500! text-[13px] font-medium text-white! transition-colors duration-150 hover:bg-orange-600! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
      >
        {t("reviewOrders")}
      </Link>
    </div>
  );
}

function Account({ email, loginHref }: { email: string; loginHref: string }) {
  const t = useTranslations("desk");
  const router = useRouter();

  async function out() {
    await signOut();
    router.push(loginHref);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-neutral-200 text-[12px] font-semibold uppercase text-neutral-700">
        {email.charAt(0)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-600">{email}</span>
      <button
        type="button"
        onClick={out}
        aria-label={t("signOut")}
        title={t("signOut")}
        className="grid size-8 place-items-center rounded-lg text-neutral-500 transition-colors duration-150 hover:bg-neutral-200/60! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
