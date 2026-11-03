import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-2xl bg-black/[0.06] motion-safe:animate-pulse", className)} />;
}

/** Placeholder for the order tracker and order history while the route loads. */
export function ShopPageSkeleton() {
  return (
    <main aria-busy className="mx-auto w-full max-w-md px-4 pt-6">
      <Bone className="h-8 w-40" />
      <Bone className="mt-3 h-4 w-56" />
      <Bone className="mt-8 h-40 w-full rounded-[28px]" />
      <Bone className="mt-3 h-20 w-full" />
      <Bone className="mt-3 h-20 w-full" />
    </main>
  );
}

/* Desk skeletons mirror the real page layouts so the swap to content doesn't jump. */

const text = "rounded-md";

function HeaderBones({ actions = 0, description = "w-72" }: { actions?: number; description?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Bone className={cn("h-7 w-40", text)} />
        <Bone className={cn("mt-2 h-4 max-w-full", description, text)} />
      </div>
      {actions > 0 ? (
        <div className="flex items-center gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Bone key={i} className={cn("h-9 rounded-full", i === actions - 1 ? "w-32" : "w-28")} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CardBones({ children, title = "w-32" }: { children: ReactNode; title?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <div className="flex min-h-11 items-center rounded-t-xl border-b border-neutral-200 bg-neutral-50 px-4">
        <Bone className={cn("h-3.5", title, text)} />
      </div>
      {children}
    </div>
  );
}

function TabsBones({ tabs }: { tabs: number }) {
  return (
    <div className="flex w-fit max-w-full gap-1 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
      {Array.from({ length: tabs }, (_, i) => (
        <Bone key={i} className={cn("h-7 w-20 shrink-0", text)} />
      ))}
    </div>
  );
}

function RowBones({ rows, avatar = "rounded-lg" }: { rows: number; avatar?: string }) {
  return (
    <ul className="divide-y divide-neutral-200">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Bone className={cn("size-11 shrink-0", avatar)} />
          <div className="min-w-0 flex-1">
            <Bone className={cn("h-4 max-w-full", text, i % 2 ? "w-36" : "w-48")} />
            <Bone className={cn("mt-1.5 h-3.5 max-w-full", text, i % 3 ? "w-56" : "w-40")} />
          </div>
          <Bone className={cn("hidden h-4 w-16 sm:block", text)} />
          <Bone className="size-8 shrink-0 rounded-lg" />
        </li>
      ))}
    </ul>
  );
}

/** Overview: header with range picker, four chart cards, recent orders table. */
export function OverviewSkeleton() {
  return (
    <div aria-busy>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Bone className={cn("h-7 w-32", text)} />
          <Bone className={cn("mt-2 h-4 w-72 max-w-full", text)} />
        </div>
        <Bone className="h-8 w-36 rounded-lg" />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-xl border border-neutral-200 bg-white px-4 pt-4 pb-3.5">
            <Bone className={cn("h-4 w-24", text)} />
            <div className="mt-3 flex items-baseline justify-between">
              <Bone className={cn("h-3.5 w-28", text)} />
              <Bone className={cn("h-3 w-14", text)} />
            </div>
            <Bone className={cn("mt-1.5 h-7 w-24", text)} />
            <Bone className="mt-3 h-[140px] w-full rounded-lg" />
            <div className="mt-2 flex justify-between">
              <Bone className={cn("h-3 w-12", text)} />
              <Bone className={cn("h-3 w-10", text)} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="mr-auto">
            <Bone className={cn("h-4 w-28", text)} />
            <Bone className={cn("mt-1.5 h-3.5 w-20", text)} />
          </div>
          <Bone className="h-8 w-36 rounded-lg" />
          <Bone className="hidden h-8 w-32 rounded-lg sm:block" />
        </div>
        <ul className="divide-y divide-neutral-200">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex items-center gap-4 px-4 py-3">
              <Bone className={cn("h-4 w-12", text)} />
              <Bone className={cn("h-4 w-20", text)} />
              <Bone className={cn("h-4 flex-1", text)} />
              <Bone className={cn("h-4 w-16", text)} />
              <Bone className={cn("hidden h-4 w-14 sm:block", text)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Orders: header plus the three board columns with a few cards each. */
export function OrdersSkeleton() {
  return (
    <div aria-busy>
      <div className="mb-5">
        <Bone className={cn("h-7 w-44", text)} />
        <Bone className={cn("mt-2 h-4 w-[28rem] max-w-full", text)} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[3, 2, 1].map((count, c) => (
          <div key={c} className="flex min-h-[60dvh] flex-col gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2">
            <div className="flex h-8 items-center gap-2 px-2">
              <Bone className="size-2 rounded-full" />
              <Bone className={cn("h-4 w-20", text)} />
              <Bone className={cn("ml-auto h-3.5 w-4", text)} />
            </div>
            {Array.from({ length: count }, (_, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <Bone className={cn("h-4 w-16", text)} />
                  <Bone className={cn("h-3.5 w-12", text)} />
                </div>
                <Bone className={cn("mt-2 h-3.5 w-28", text)} />
                <div className="mt-3 space-y-1.5">
                  <Bone className={cn("h-3.5 w-full", text)} />
                  <Bone className={cn("h-3.5 w-3/4", text)} />
                </div>
                <Bone className="mt-3 h-8 w-full rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Products: header with two actions, filters, then category cards of product rows. */
export function ProductsSkeleton() {
  return (
    <div aria-busy>
      <HeaderBones actions={2} description="w-96" />
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <TabsBones tabs={4} />
        <Bone className="h-8 w-40 rounded-lg" />
        <Bone className="ml-auto h-8 w-full rounded-lg sm:w-56" />
      </div>
      <div className="mt-4 flex flex-col gap-4">
        <CardBones title="w-24">
          <RowBones rows={4} />
        </CardBones>
        <CardBones title="w-20">
          <RowBones rows={3} />
        </CardBones>
      </div>
    </div>
  );
}

/** Admin: header, section tabs, invite bar and the team list. */
export function AdminSkeleton() {
  return (
    <div aria-busy>
      <HeaderBones description="w-80" />
      <div className="mt-5">
        <TabsBones tabs={5} />
      </div>
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Bone className="h-8 w-56 rounded-lg" />
          <Bone className="ml-auto h-9 w-32 rounded-full" />
        </div>
        <CardBones title="w-16">
          <RowBones rows={4} avatar="rounded-full" />
        </CardBones>
      </div>
    </div>
  );
}

/** Account: header, two-factor card, data card. */
export function AccountSkeleton() {
  return (
    <div aria-busy>
      <HeaderBones description="w-80" />
      <div className="mt-5 flex flex-col gap-4">
        <CardBones title="w-36">
          <div className="max-w-md p-4">
            <Bone className={cn("h-5 w-44", text)} />
            <Bone className={cn("mt-2 h-3.5 w-full", text)} />
            <Bone className={cn("mt-1.5 h-3.5 w-2/3", text)} />
            <Bone className={cn("mt-5 h-3.5 w-16", text)} />
            <Bone className="mt-1.5 h-9 w-full rounded-lg" />
            <Bone className="mt-4 h-9 w-24 rounded-full" />
          </div>
        </CardBones>
        <CardBones title="w-24">
          <div className="flex flex-wrap gap-2 p-4">
            <Bone className="h-9 w-40 rounded-full" />
            <Bone className="h-9 w-40 rounded-full" />
          </div>
        </CardBones>
      </div>
    </div>
  );
}

/** Seat map: the full-bleed designer — toolbar, tool rail, canvas and inspector — each with its own inner padding. */
export function SeatMapSkeleton() {
  return (
    <div aria-busy className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-neutral-200 bg-white px-3">
        <Bone className={cn("h-4 w-20", text)} />
        <Bone className={cn("h-3.5 w-28", text)} />
        <div className="ml-auto flex items-center gap-1.5">
          <Bone className="size-8 rounded-lg" />
          <Bone className="size-8 rounded-lg" />
          <Bone className="hidden h-8 w-20 rounded-full sm:block" />
          <Bone className="hidden h-8 w-24 rounded-full md:block" />
          <Bone className="h-8 w-24 rounded-full" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-neutral-200 bg-white py-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Bone key={i} className="size-9 rounded-lg" />
          ))}
        </div>
        <div className="grid min-w-0 flex-1 place-items-center bg-neutral-50 p-6">
          <Bone className="aspect-square w-[min(70%,32rem)] rounded-full" />
        </div>
        <div className="hidden w-[320px] shrink-0 flex-col gap-3 border-l border-neutral-200 bg-white p-4 lg:flex">
          <Bone className={cn("h-4 w-24", text)} />
          <Bone className={cn("h-3.5 w-48", text)} />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="mt-2">
              <Bone className={cn("h-3 w-20", text)} />
              <Bone className="mt-1.5 h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
