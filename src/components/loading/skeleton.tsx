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

/** Placeholder for a desk page inside the shell while it loads. */
export function DeskPageSkeleton() {
  return (
    <div aria-busy>
      <Bone className="h-7 w-48 rounded-lg" />
      <Bone className="mt-2 h-4 w-72 rounded-lg" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Bone className="h-64" />
        <Bone className="h-64" />
        <Bone className="h-64" />
      </div>
    </div>
  );
}
