"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowUpDown,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  MoreHorizontal,
  PackageOpen,
  PackageX,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Tags,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { AdminProduct, ProductCatalog } from "@/lib/management/products";
import { formatCents } from "@/lib/money";
import { useTRPC } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { CategoriesSheet } from "./categories-sheet";
import { ProductEditor, type EditorTarget } from "./product-editor";
import { useSortable } from "./use-sortable";

type Props = { stadiumSlug: string; catalog: ProductCatalog };

type Filter = "all" | "live" | "soldout" | "disabled";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Available" },
  { id: "soldout", label: "Sold out" },
  { id: "disabled", label: "Disabled" },
];

const ALL = "all";

function matchesFilter(p: AdminProduct, filter: Filter) {
  if (filter === "live") return p.isAvailable && !p.isSoldOut;
  if (filter === "soldout") return p.isSoldOut;
  if (filter === "disabled") return !p.isAvailable;
  return true;
}

export function ProductsManager({ stadiumSlug, catalog }: Props) {
  const { currency } = catalog;
  const [categories, setCategories] = useState(catalog.categories);
  const [products, setProducts] = useState(catalog.products);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoriesSession, setCategoriesSession] = useState(0);
  /** The category being sorted, with its products in the new order. */
  const [sorting, setSorting] = useState<{ categoryId: string; ids: string[] } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<string>(ALL);
  const query = (useSearchParams().get("q") ?? "").trim().toLowerCase();
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [deleting, setDeleting] = useState<AdminProduct | null>(null);
  const { toast } = useToast();

  const trpc = useTRPC();
  const flags = useMutation(trpc.products.setFlags.mutationOptions());
  const remove = useMutation(trpc.products.delete.mutationOptions());
  const reorder = useMutation(trpc.products.reorder.mutationOptions());

  function openEditor(next: EditorTarget) {
    setTarget(next);
    setSession((n) => n + 1);
    setOpen(true);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "n" || e.metaKey || e.ctrlKey || e.altKey || open) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      e.preventDefault();
      setTarget({ kind: "new" });
      setSession((n) => n + 1);
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, live: 0, soldout: 0, disabled: 0 };
    for (const p of products) for (const f of FILTERS) if (matchesFilter(p, f.id)) c[f.id] += 1;
    return c;
  }, [products]);

  const sections = useMemo(() => {
    const visible = products.filter((p) => {
      if (!matchesFilter(p, filter)) return false;
      if (category !== ALL && p.categoryId !== category) return false;
      if (!query) return true;
      return [p.name, p.description ?? "", ...p.optionGroups.flatMap((g) => [g.name, ...g.options.map((o) => o.name)])].some((s) =>
        s.toLowerCase().includes(query),
      );
    });
    return categories
      .map((c) => ({ category: c, products: visible.filter((p) => p.categoryId === c.id) }))
      .filter((s) => s.products.length > 0);
  }, [products, categories, filter, category, query]);

  const shown = sections.reduce((n, s) => n + s.products.length, 0);
  const narrowed = filter !== "all" || category !== ALL || query !== "";

  function replace(product: AdminProduct) {
    setProducts((list) => list.map((p) => (p.id === product.id ? product : p)));
  }

  async function toggle(product: AdminProduct, change: { isAvailable?: boolean; isSoldOut?: boolean }) {
    replace({ ...product, ...change });
    try {
      const result = await flags.mutateAsync({ stadium: stadiumSlug, id: product.id, flags: change });
      if (!result.ok) throw new Error(result.error);
      replace(result.product);
      const label =
        change.isSoldOut !== undefined
          ? change.isSoldOut
            ? `${product.name} marked sold out`
            : `${product.name} is back in stock`
          : change.isAvailable
            ? `${product.name} is in the shop`
            : `${product.name} is hidden from the shop`;
      toast({ message: label, status: "success" });
    } catch (error) {
      replace(product);
      toast({ message: error instanceof Error && error.message ? error.message : "Couldn’t update. Try again.", status: "error" });
    }
  }

  async function saveOrder() {
    if (!sorting) return;
    const { categoryId, ids } = sorting;
    const before = products.filter((p) => p.categoryId === categoryId).map((p) => p.id);
    if (before.join() === ids.join()) {
      setSorting(null);
      return;
    }
    try {
      const result = await reorder.mutateAsync({ stadium: stadiumSlug, categoryId, ids });
      if (!result.ok) {
        toast({ message: result.error, status: "error" });
        return;
      }
      setProducts((list) => {
        const queue = ids.map((id) => list.find((p) => p.id === id)!);
        let i = 0;
        return list.map((p) => (p.categoryId === categoryId ? queue[i++] : p));
      });
      setSorting(null);
      toast({ message: `${categories.find((c) => c.id === categoryId)?.name ?? "Category"} order saved`, status: "success" });
    } catch {
      toast({ message: "Couldn’t save the order. Try again.", status: "error" });
    }
  }

  async function confirmDelete() {
    const product = deleting;
    if (!product) return;
    try {
      const result = await remove.mutateAsync({ stadium: stadiumSlug, id: product.id });
      if (!result.ok) {
        toast({ message: result.error, status: "error" });
        return;
      }
      setProducts((list) => list.filter((p) => p.id !== product.id));
      if (target?.kind === "edit" && target.product.id === product.id) setOpen(false);
      toast({ message: `${product.name} deleted`, status: "success" });
    } catch {
      toast({ message: "Couldn’t delete. Try again.", status: "error" });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em]">Products</h1>
          <p className="mt-1 text-[14px] text-neutral-500">What’s on the menu at {catalog.stadiumName}. Changes reach the shop within a minute.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCategoriesSession((n) => n + 1);
              setCategoriesOpen(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-200 bg-white! px-4 text-[14px] font-medium transition-colors duration-150 hover:bg-neutral-50! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <Tags className="size-4 text-neutral-500" aria-hidden />
            Categories
          </button>
          <button
            type="button"
            onClick={() => openEditor({ kind: "new" })}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-900! px-4 text-[14px] font-medium text-white! transition-colors duration-150 hover:bg-neutral-700! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <Plus className="size-4" aria-hidden />
            New product
            <kbd className="ml-1 hidden rounded border border-white/20 px-1 text-[11px] leading-4 text-white/70 sm:inline">N</kbd>
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Filter products" className="flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150",
                filter === f.id ? "bg-white! text-neutral-900 shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-neutral-500 hover:text-neutral-900",
              )}
            >
              {f.label}
              <span className="text-[12px] tabular-nums text-neutral-400">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger size="sm" aria-label="Filter by category" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchBox />
      </div>

      {shown === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-neutral-200 px-4 py-16 text-center">
          <PackageOpen className="size-5 text-neutral-400" aria-hidden />
          <p className="text-[14px] font-medium">{narrowed ? "No products match" : "No products yet"}</p>
          <p className="text-[13px] text-neutral-500">
            {narrowed ? "Clear the search or pick another filter." : "Add the first thing fans can order."}
          </p>
          {!narrowed ? (
            <button
              type="button"
              onClick={() => openEditor({ kind: "new" })}
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-900! px-3.5 text-[13px] font-medium text-white! hover:bg-neutral-700!"
            >
              <Plus className="size-3.5" aria-hidden />
              New product
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {narrowed ? (
            <p className="-mb-1 text-[13px] text-neutral-500 tabular-nums">
              {shown} of {products.length} products{query ? ` matching “${query}”` : ""}
            </p>
          ) : null}
          {sections.map(({ category: c, products: rows }) => {
            const isSorting = sorting?.categoryId === c.id;
            return (
              <section
                key={c.id}
                className={cn("rounded-xl border bg-white", isSorting ? "border-neutral-900" : "border-neutral-200")}
                aria-labelledby={`cat-${c.id}`}
              >
                <div className="flex min-h-11 items-center gap-2 rounded-t-xl border-b border-neutral-200 bg-neutral-50 py-1.5 pr-2 pl-4">
                  <h2 id={`cat-${c.id}`} className="flex flex-1 items-center gap-2 text-[13px] font-medium">
                    {c.name}
                    <span className="text-neutral-400 tabular-nums">{rows.length}</span>
                    {isSorting ? <span className="font-normal text-neutral-500">· Drag to reorder</span> : null}
                  </h2>
                  {isSorting ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setSorting(null)}
                        disabled={reorder.isPending}
                        className="inline-flex h-7 items-center rounded-full px-3 text-[13px] font-medium text-neutral-600 transition-colors duration-150 hover:bg-neutral-200/60! hover:text-neutral-900"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveOrder()}
                        disabled={reorder.isPending}
                        className="inline-flex h-7 items-center gap-1.5 rounded-full bg-neutral-900! px-3 text-[13px] font-medium text-white! transition-colors duration-150 hover:bg-neutral-700! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
                      >
                        {reorder.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                        Save order
                      </button>
                    </>
                  ) : rows.length > 1 && !sorting ? (
                    <button
                      type="button"
                      onClick={() => setSorting({ categoryId: c.id, ids: rows.map((p) => p.id) })}
                      disabled={narrowed}
                      title={narrowed ? "Clear the search and filters to reorder" : undefined}
                      className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-neutral-600 transition-colors duration-150 hover:bg-neutral-200/60! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <ArrowUpDown className="size-3.5" aria-hidden />
                      Reorder
                    </button>
                  ) : null}
                </div>
                {isSorting && sorting ? (
                  <SortableRows
                    products={rows}
                    ids={sorting.ids}
                    onChange={(ids) => setSorting({ categoryId: c.id, ids })}
                  />
                ) : (
                  <ul className="divide-y divide-neutral-200 overflow-hidden rounded-b-xl">
                    {rows.map((p) => (
                      <ProductRow
                        key={p.id}
                        product={p}
                        currency={currency}
                        onOpen={() => openEditor({ kind: "edit", product: p })}
                        onDuplicate={() => openEditor({ kind: "copy", product: p })}
                        onDelete={() => setDeleting(p)}
                        onToggle={(change) => toggle(p, change)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Sheet open={open} onOpenChange={(v) => !v && setOpen(false)}>
        {target ? (
          <ProductEditor
            key={session}
            target={target}
            stadiumSlug={stadiumSlug}
            currency={currency}
            categories={categories}
            onRequestClose={() => setOpen(false)}
            onDelete={setDeleting}
            onSaved={(product, created) => {
              setProducts((list) => (created ? [...list, product] : list.map((p) => (p.id === product.id ? product : p))));
              setOpen(false);
              toast({ message: created ? `${product.name} added to the menu` : `${product.name} saved`, status: "success" });
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={categoriesOpen} onOpenChange={(v) => !v && setCategoriesOpen(false)}>
        {categoriesSession > 0 ? (
          <CategoriesSheet
            key={categoriesSession}
            stadiumSlug={stadiumSlug}
            categories={categories}
            onRequestClose={() => setCategoriesOpen(false)}
            onSaved={(next) => {
              setCategories(next);
              setCategoriesOpen(false);
              if (category !== ALL && !next.some((c) => c.id === category)) setCategory(ALL);
              toast({ message: "Categories saved", status: "success" });
            }}
          />
        ) : null}
      </Sheet>

      <AlertDialog open={deleting !== null} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It disappears from the shop right away, along with its options. Past orders keep their receipts. To take it off the menu
            for a while, disable it instead.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              tone="destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete product"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProductRow({
  product: p,
  currency,
  onOpen,
  onDuplicate,
  onDelete,
  onToggle,
}: {
  product: AdminProduct;
  currency: string;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggle: (change: { isAvailable?: boolean; isSoldOut?: boolean }) => void;
}) {
  const optionCount = p.optionGroups.reduce((n, g) => n + g.options.length, 0);
  const meta = p.optionGroups.length
    ? `${p.optionGroups.length} option group${p.optionGroups.length === 1 ? "" : "s"} · ${p.optionGroups.map((g) => g.name).join(", ")}`
    : (p.description ?? "No description");

  return (
    <li className={cn("group flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-neutral-50", !p.isAvailable && "bg-neutral-50/60")}>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500"
        aria-label={`Edit ${p.name}`}
      >
        <Thumb product={p} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn("truncate text-[14px] font-medium", !p.isAvailable && "text-neutral-500")}>{p.name}</span>
            {p.isSoldOut ? <Badge tone="bg-amber-500">Sold out</Badge> : null}
            {!p.isAvailable ? <Badge tone="bg-neutral-500">Disabled</Badge> : null}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-neutral-500" title={meta}>
            {meta}
          </span>
        </span>
      </button>

      <span className="hidden w-24 shrink-0 text-right text-[12px] text-neutral-500 tabular-nums md:block">
        {optionCount ? `${optionCount} option${optionCount === 1 ? "" : "s"}` : ""}
      </span>
      <span className="w-20 shrink-0 text-right text-[14px] font-medium tabular-nums">{formatCents(p.priceCents, currency)}</span>

      <label className="hidden shrink-0 items-center gap-2 text-[12px] text-neutral-500 sm:flex" title={p.isAvailable ? "Shown in the shop" : "Hidden from the shop"}>
        <Switch checked={p.isAvailable} onCheckedChange={(isAvailable) => onToggle({ isAvailable })} aria-label={`Show ${p.name} in shop`} />
      </label>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More actions for ${p.name}`}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-500 transition-colors duration-150 hover:bg-neutral-200/60! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500 data-[state=open]:bg-neutral-200/60!"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onOpen}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onToggle({ isSoldOut: !p.isSoldOut })}>
            {p.isSoldOut ? <RotateCcw /> : <PackageX />}
            {p.isSoldOut ? "Back in stock" : "Mark sold out"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onToggle({ isAvailable: !p.isAvailable })} className="sm:hidden">
            {p.isAvailable ? <EyeOff /> : <Eye />}
            {p.isAvailable ? "Disable" : "Enable"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function SortableRows({ products, ids, onChange }: { products: AdminProduct[]; ids: string[]; onChange: (ids: string[]) => void }) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const { rowRef, handleProps, dragging, announcement } = useSortable({
    ids,
    onReorder: onChange,
    nameOf: (id) => byId.get(id)?.name ?? "Product",
  });

  return (
    <>
      <ul className="divide-y divide-neutral-200">
        {ids.map((id, i) => {
          const p = byId.get(id);
          if (!p) return null;
          return (
            <li
              key={id}
              ref={rowRef(id)}
              className={cn(
                "flex items-center gap-3 bg-white py-2 pr-4 pl-2 last:rounded-b-xl",
                dragging === id && "relative z-10 rounded-lg shadow-[0_6px_20px_rgba(17,17,17,0.12)]",
              )}
            >
              <button
                type="button"
                {...handleProps(id)}
                className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-neutral-400 transition-colors duration-150 hover:bg-neutral-100! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500 active:cursor-grabbing"
              >
                <GripVertical className="size-4" aria-hidden />
              </button>
              <Thumb product={p} />
              <span className={cn("min-w-0 flex-1 truncate text-[14px] font-medium", !p.isAvailable && "text-neutral-500")}>{p.name}</span>
              <span className="w-6 text-right text-[12px] text-neutral-400 tabular-nums">{i + 1}</span>
            </li>
          );
        })}
      </ul>
      <p aria-live="assertive" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function Badge({ tone, children }: { tone: string; children: string }) {
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white", tone)}>{children}</span>;
}

function Thumb({ product: p }: { product: AdminProduct }) {
  return (
    <span className={cn("relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-neutral-200 bg-photo", (!p.isAvailable || p.isSoldOut) && "opacity-60 grayscale")}>
      {p.imageUrl ? (
        <Image src={p.imageUrl} alt="" fill sizes="44px" className="bg-photo object-contain" />
      ) : (
        <span className="text-[15px] font-semibold text-neutral-500">{p.name.charAt(0)}</span>
      )}
    </span>
  );
}

/** Same `?q=` the sidebar search writes, so either box filters the list. */
function SearchBox() {
  const params = useSearchParams();

  function update(value: string) {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set("q", value);
    else next.delete("q");
    const query = next.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }

  return (
    <label className="ml-auto flex h-8 w-full items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 transition-[border-color,box-shadow] duration-150 focus-within:border-blue-500 focus-within:ring-3 focus-within:ring-blue-500/15 sm:w-56">
      <Search className="size-4 shrink-0 text-neutral-400" aria-hidden />
      <input
        type="search"
        defaultValue={params.get("q") ?? ""}
        onChange={(e) => update(e.target.value.trim())}
        placeholder="Search products or options"
        aria-label="Search products"
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-neutral-400"
      />
    </label>
  );
}
