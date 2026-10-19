"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { AdminCategory } from "@/lib/management/products";
import { CATEGORY_NAME_MAX, categoriesInput, MAX_CATEGORIES } from "@/lib/management/product-input";
import { useTRPC } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { useSortable } from "./use-sortable";

type Props = {
  stadiumSlug: string;
  categories: AdminCategory[];
  onSaved: (categories: AdminCategory[]) => void;
  onRequestClose: () => void;
};

type Row = { key: string; id?: string; name: string; productCount: number };

const rowsFrom = (categories: AdminCategory[]): Row[] => categories.map((c) => ({ key: c.id, id: c.id, name: c.name, productCount: c.productCount }));

export function CategoriesSheet({ stadiumSlug, categories, onSaved, onRequestClose }: Props) {
  const [initial] = useState(() => rowsFrom(categories));
  const [rows, setRows] = useState(initial);
  const [triedSave, setTriedSave] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const trpc = useTRPC();
  const save = useMutation(trpc.products.saveCategories.mutationOptions());

  const payload = rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), name: r.name }));
  const parsed = categoriesInput.safeParse(payload);
  const errors: Record<number, string> = {};
  if (triedSave && !parsed.success) {
    for (const issue of parsed.error.issues) {
      const index = issue.path[0];
      if (typeof index === "number" && errors[index] === undefined) errors[index] = issue.message;
    }
  }
  const listError = triedSave && !parsed.success ? parsed.error.issues.find((i) => i.path.length === 0)?.message : undefined;
  const dirty = JSON.stringify(payload) !== JSON.stringify(initial.map((r) => ({ id: r.id, name: r.name })));

  const sortable = useSortable({
    ids: rows.map((r) => r.key),
    onReorder: (keys) => setRows((list) => keys.map((k) => list.find((r) => r.key === k)!)),
    nameOf: (key) => rows.find((r) => r.key === key)?.name || "New category",
  });

  function rename(key: string, name: string) {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, name } : r)));
  }

  function add() {
    const key = crypto.randomUUID();
    setRows((list) => [...list, { key, name: "", productCount: 0 }]);
    requestAnimationFrame(() => document.getElementById(`category-${key}`)?.focus());
  }

  function attemptClose() {
    if (dirty && !save.isPending) setConfirmClose(true);
    else onRequestClose();
  }

  async function submit() {
    setFailure(null);
    if (!parsed.success) {
      setTriedSave(true);
      return;
    }
    try {
      const result = await save.mutateAsync({ stadium: stadiumSlug, categories: parsed.data });
      if (!result.ok) {
        setFailure(result.error);
        return;
      }
      onSaved(result.categories);
    } catch {
      setFailure("Couldn’t save. Check the connection and try again.");
    }
  }

  const errorCount = Object.keys(errors).length;

  return (
    <SheetContent
      closeLabel="Close categories"
      className="sm:max-w-[480px]"
      onClose={attemptClose}
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        attemptClose();
      }}
      onPointerDownOutside={(e) => {
        e.preventDefault();
        attemptClose();
      }}
      onInteractOutside={(e) => e.preventDefault()}
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      <header className="flex h-14 shrink-0 items-center border-b border-neutral-200 px-5 pr-14">
        <div className="min-w-0">
          <SheetTitle>Categories</SheetTitle>
          <SheetDescription className="truncate">{dirty ? "Unsaved changes" : "The shop lists them in this order"}</SheetDescription>
        </div>
      </header>

      <form
        id="categories-form"
        className="flex-1 overflow-y-auto px-5 py-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <p className="text-[13px] text-neutral-500">
          Shared by every stadium. A category only shows in the shop once it has products. Empty ones can be deleted.
        </p>

        <ul className="mt-4 divide-y divide-neutral-200 rounded-xl border border-neutral-200">
          {rows.map((r, i) => {
            const error = errors[i];
            return (
              <li
                key={r.key}
                ref={sortable.rowRef(r.key)}
                className={cn(
                  "flex items-start gap-2 bg-white px-2 py-2 first:rounded-t-xl last:rounded-b-xl",
                  sortable.dragging === r.key && "relative z-10 shadow-[0_6px_20px_rgba(17,17,17,0.12)]",
                )}
              >
                <button
                  type="button"
                  {...sortable.handleProps(r.key)}
                  className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-neutral-400 transition-colors duration-150 hover:bg-neutral-100! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500 active:cursor-grabbing"
                >
                  <GripVertical className="size-4" aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                  <Input
                    id={`category-${r.key}`}
                    value={r.name}
                    onChange={(e) => rename(r.key, e.target.value)}
                    maxLength={CATEGORY_NAME_MAX + 10}
                    placeholder="Category name"
                    aria-label={`Category ${i + 1} name`}
                    aria-invalid={Boolean(error)}
                    className="aria-invalid:border-red-500"
                  />
                  {error ? <p className="mt-1 text-[12px] text-red-600">{error}</p> : null}
                </div>
                <span className="mt-2 w-20 shrink-0 text-right text-[12px] text-neutral-500 tabular-nums">
                  {r.id ? `${r.productCount} product${r.productCount === 1 ? "" : "s"}` : "New"}
                </span>
                <button
                  type="button"
                  onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                  disabled={r.productCount > 0}
                  aria-label={`Delete ${r.name || "category"}`}
                  title={r.productCount > 0 ? "Move its products to another category first" : "Delete"}
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-neutral-500 transition-colors duration-150 hover:bg-red-50! hover:text-red-600 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:pointer-events-none disabled:opacity-30"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
        <p aria-live="assertive" className="sr-only">
          {sortable.announcement}
        </p>
        {listError ? <p className="mt-2 text-[12px] text-red-600">{listError}</p> : null}

        <button
          type="button"
          onClick={add}
          disabled={rows.length >= MAX_CATEGORIES}
          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-neutral-200 bg-white! px-3 text-[13px] font-medium transition-colors duration-150 hover:bg-neutral-50! disabled:opacity-50"
        >
          <Plus className="size-3.5" aria-hidden />
          Add category
        </button>
      </form>

      <footer className="flex shrink-0 items-center gap-2 border-t border-neutral-200 bg-white px-5 py-3">
        <p role="status" className="min-w-0 flex-1 truncate text-[13px] text-red-600">
          {failure ?? (errorCount ? (errorCount === 1 ? "1 name needs fixing" : `${errorCount} names need fixing`) : "")}
        </p>
        <button
          type="button"
          onClick={attemptClose}
          className="inline-flex h-9 items-center rounded-full border border-neutral-200 bg-white! px-4 text-[14px] font-medium transition-colors duration-150 hover:bg-neutral-50!"
        >
          Cancel
        </button>
        <button
          type="submit"
          form="categories-form"
          disabled={save.isPending || !dirty}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-neutral-900! px-4 text-[14px] font-medium text-white! transition-colors duration-150 hover:bg-neutral-700! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </footer>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
          <AlertDialogDescription>Renames, new categories and the new order haven’t been saved.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction tone="destructive" onClick={onRequestClose}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SheetContent>
  );
}
