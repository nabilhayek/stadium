"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

type Props = { stadiumSlug: string; stadiumName: string };

export function DeskNav({ stadiumSlug, stadiumName }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/${stadiumSlug}/management`;
  const orders = `${base}/orders`;

  async function out() {
    await signOut();
    router.push(`${base}/login`);
    router.refresh();
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Kitchen</p>
        <p className="font-display mt-1 text-[22px] font-semibold leading-none tracking-tight">{stadiumName}</p>
      </div>
      <nav className="flex items-center gap-1.5" aria-label="Kitchen">
        <Tab href={base} active={pathname === base}>
          Overview
        </Tab>
        <Tab href={orders} active={pathname.startsWith(orders)}>
          Orders
        </Tab>
        <button type="button" onClick={out} className="button button--secondary button--sm">
          Sign out
        </button>
      </nav>
    </header>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-full px-4 py-2 text-[14px] font-medium",
        active ? "bg-foreground text-background" : "border border-border bg-surface",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
