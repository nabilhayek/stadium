"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { AdminCategory, AdminProduct } from "@/lib/management/products";
import { DESCRIPTION_MAX } from "@/lib/management/product-input";
import { ALLERGENS, NUTRITION_UNITS, type NutritionUnit } from "@/lib/menu/nutrition";
import { currencySymbol, parseCents } from "@/lib/money";
import type { MenuProduct } from "@/lib/queries/stadium";
import { useTRPC, useTRPCClient } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { draftFrom, toInput, type DraftErrors, type NutritionDraft, type ProductDraft } from "./draft";
import { ImageField } from "./image-field";
import { OptionGroups } from "./option-groups";
import { ShopPreview } from "./shop-preview";

export type EditorTarget = { kind: "new" } | { kind: "edit"; product: AdminProduct } | { kind: "copy"; product: AdminProduct };

type Props = {
  target: EditorTarget;
  stadiumSlug: string;
  currency: string;
  categories: AdminCategory[];
  onSaved: (product: AdminProduct, created: boolean) => void;
  onDelete: (product: AdminProduct) => void;
  onRequestClose: () => void;
};

const NUTRITION_FIELDS: { key: keyof NutritionDraft; label: string; unit: string; optional?: boolean }[] = [
  { key: "kcal", label: "Energy", unit: "kcal" },
  { key: "fatG", label: "Fat", unit: "g" },
  { key: "carbsG", label: "Carbohydrates", unit: "g" },
  { key: "sugarG", label: "of which sugars", unit: "g", optional: true },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "saltG", label: "Salt", unit: "g", optional: true },
];

const UNIT_LABELS: Record<NutritionUnit, string> = { g: "grams", ml: "millilitres", serving: "serving" };

export function ProductEditor({ target, stadiumSlug, currency, categories, onSaved, onDelete, onRequestClose }: Props) {
  const editing = target.kind === "edit" ? target.product : null;
  const [initial] = useState(() =>
    draftFrom(target.kind === "new" ? null : target.product, categories[0]?.id ?? "", target.kind === "copy"),
  );
  const [draft, setDraft] = useState<ProductDraft>(initial);
  const [triedSave, setTriedSave] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const trpc = useTRPC();
  const client = useTRPCClient();
  const create = useMutation(trpc.products.create.mutationOptions());
  const update = useMutation(trpc.products.update.mutationOptions());
  const saving = create.isPending || update.isPending;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const errors: DraftErrors = triedSave ? (toInput(draft).errors ?? {}) : {};

  /** Photos uploaded while this editor is open, and the one that got saved. The rest are deleted on close. */
  const uploads = useRef<UploadSession>({ urls: [], saved: null });
  // The sheet keeps this component mounted after closing, so closing releases explicitly; unmount is the fallback.
  useEffect(() => {
    const session = uploads.current;
    return () => releaseUploads(session, (urls) => client.products.discardImages.mutate({ stadium: stadiumSlug, urls }));
  }, [client, stadiumSlug]);

  function close() {
    releaseUploads(uploads.current, (urls) => client.products.discardImages.mutate({ stadium: stadiumSlug, urls }));
    onRequestClose();
  }

  function set<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setNutrition(key: keyof NutritionDraft, value: string) {
    setDraft((d) => ({ ...d, nutrition: { ...d.nutrition, [key]: value } }));
  }

  function attemptClose() {
    if (dirty && !saving) setConfirmClose(true);
    else close();
  }

  async function save() {
    setFailure(null);
    const checked = toInput(draft);
    if (checked.errors) {
      setTriedSave(true);
      requestAnimationFrame(() => document.querySelector("[data-editor] [aria-invalid=true]")?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    try {
      const result = editing
        ? await update.mutateAsync({ stadium: stadiumSlug, id: editing.id, product: checked.input })
        : await create.mutateAsync({ stadium: stadiumSlug, product: checked.input });
      if (!result.ok) {
        setFailure(result.error);
        return;
      }
      uploads.current.saved = result.product.imageUrl;
      releaseUploads(uploads.current, (urls) => client.products.discardImages.mutate({ stadium: stadiumSlug, urls }));
      onSaved(result.product, !editing);
    } catch {
      setFailure("Couldn’t save. Check the connection and try again.");
    }
  }

  const descriptionLeft = DESCRIPTION_MAX - draft.description.trim().length;
  const title = editing ? "Edit product" : target.kind === "copy" ? "Duplicate product" : "New product";

  return (
    <SheetContent
      data-editor
      closeLabel="Close editor"
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
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        document.getElementById("product-name")?.focus();
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 px-5 pr-14">
        <div className="min-w-0">
          <SheetTitle className="truncate">{draft.name.trim() || title}</SheetTitle>
          <SheetDescription className="truncate">
            {editing
              ? `${title} · ${dirty ? "Unsaved changes" : "No changes"}`
              : `${draft.name.trim() ? `${title} · ` : ""}Not in the shop until you create it`}
          </SheetDescription>
        </div>
      </header>

      <form
        id="product-form"
        className="flex-1 overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <Section title="Photo" description="Shown on the menu and the product page. Cropped to 3:2.">
          <ImageField
            stadiumSlug={stadiumSlug}
            value={draft.imageUrl}
            onChange={(url) => set("imageUrl", url)}
            onUploaded={(url) => uploads.current.urls.push(url)}
            onBusy={setUploading}
          />
        </Section>

        <Section title="In the shop" description="Updates as you type. The menu card and the Last ordered rail.">
          <ShopPreview stadiumSlug={stadiumSlug} currency={currency} product={previewOf(draft, editing?.id)} />
        </Section>

        <Section title="Details">
          <Field label="Name" error={errors.name} htmlFor="product-name">
            <Input
              id="product-name"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Hamburger menu"
              aria-invalid={Boolean(errors.name)}
              className="aria-invalid:border-red-500"
            />
          </Field>
          <Field
            label="Description"
            htmlFor="product-description"
            error={errors.description}
            aside={
              <span className={cn("tabular-nums", descriptionLeft < 0 ? "text-red-600" : descriptionLeft <= 12 ? "text-orange-600" : "text-neutral-400")}>
                {draft.description.trim().length}/{DESCRIPTION_MAX}
              </span>
            }
          >
            <textarea
              id="product-description"
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="One line on what’s in it."
              aria-invalid={Boolean(errors.description) || descriptionLeft < 0}
              aria-describedby="description-hint"
              className="block w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[14px] leading-snug outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-neutral-400 focus-visible:border-blue-500 focus-visible:ring-3 focus-visible:ring-blue-500/15 aria-invalid:border-red-500"
            />
            <p id="description-hint" className="mt-1 text-[12px] text-neutral-500">
              Up to {DESCRIPTION_MAX} characters, so it fits two lines on the menu.
            </p>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" error={errors.categoryId}>
              <Select value={draft.categoryId} onValueChange={(v) => set("categoryId", v)}>
                <SelectTrigger aria-label="Category" className="w-full">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent align="start">
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Price" error={errors.priceCents} htmlFor="product-price">
              <div
                className={cn(
                  "flex h-9 items-center rounded-lg border bg-white px-3 text-[14px] transition-[border-color,box-shadow] duration-150 focus-within:border-blue-500 focus-within:ring-3 focus-within:ring-blue-500/15",
                  errors.priceCents ? "border-red-500" : "border-neutral-200",
                )}
              >
                <span className="text-neutral-400">{currencySymbol(currency)}</span>
                <input
                  id="product-price"
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(e) => set("price", e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="0.00"
                  aria-invalid={Boolean(errors.priceCents)}
                  className="min-w-0 flex-1 bg-transparent pl-1.5 tabular-nums outline-none placeholder:text-neutral-400"
                />
              </div>
            </Field>
          </div>
        </Section>

        <Section title="Availability">
          <div className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
            <Toggle
              label="Show in shop"
              description="Turn off to hide it from the menu, for example out of season."
              checked={draft.isAvailable}
              onChange={(v) => set("isAvailable", v)}
            />
            <Toggle
              label="Sold out"
              description="Stays on the menu, greyed out, and can’t be ordered."
              checked={draft.isSoldOut}
              onChange={(v) => set("isSoldOut", v)}
            />
          </div>
        </Section>

        <Section
          title="Options"
          description="Groups of choices on this product. Each option can add to the price, lower it, or leave it."
        >
          <OptionGroups groups={draft.groups} currency={currency} errors={errors} onChange={(groups) => set("groups", groups)} />
        </Section>

        <Section title="Nutrition" description="Optional. Values per amount, as on the packaging.">
          <div className="rounded-xl border border-neutral-200">
            <Toggle
              label="Show nutrition"
              description="Adds a nutrition panel to the product page."
              checked={draft.hasNutrition}
              onChange={(v) => set("hasNutrition", v)}
            />
            {draft.hasNutrition ? (
              <div className="border-t border-neutral-200 p-3">
                <div className="flex items-center gap-2 text-[14px]">
                  <span className="text-neutral-600">Per</span>
                  <Input
                    inputMode="decimal"
                    value={draft.nutrition.amount}
                    onChange={(e) => setNutrition("amount", e.target.value.replace(/[^\d.,]/g, ""))}
                    aria-label="Amount"
                    aria-invalid={Boolean(errors["nutrition.per.amount"])}
                    disabled={draft.nutrition.unit === "serving"}
                    className="h-8 w-20 text-right tabular-nums aria-invalid:border-red-500"
                  />
                  <Select
                    value={draft.nutrition.unit}
                    onValueChange={(v) => {
                      setNutrition("unit", v);
                      if (v === "serving") setNutrition("amount", "1");
                    }}
                  >
                    <SelectTrigger size="sm" aria-label="Unit" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      {NUTRITION_UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {UNIT_LABELS[u]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <dl className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
                  {NUTRITION_FIELDS.map((f) => {
                    const error = errors[`nutrition.${f.key}`];
                    return (
                      <div key={f.key} className="flex items-center gap-3 px-3 py-1.5">
                        <dt className={cn("flex-1 text-[14px]", f.optional && "pl-3 text-neutral-600")}>
                          <label htmlFor={`n-${f.key}`}>{f.label}</label>
                          {f.optional ? <span className="ml-1.5 text-[12px] text-neutral-400">optional</span> : null}
                          {error ? <span className="ml-2 text-[12px] text-red-600">{error}</span> : null}
                        </dt>
                        <dd className="flex items-center gap-1.5">
                          <Input
                            id={`n-${f.key}`}
                            inputMode="decimal"
                            value={draft.nutrition[f.key]}
                            onChange={(e) => setNutrition(f.key, e.target.value.replace(/[^\d.,]/g, ""))}
                            placeholder={f.optional ? "–" : "0"}
                            aria-invalid={Boolean(error)}
                            className="h-8 w-20 text-right tabular-nums aria-invalid:border-red-500"
                          />
                          <span className="w-8 text-[13px] text-neutral-500">{f.unit}</span>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ) : null}
          </div>
        </Section>

        <Section title="Allergens" description="The 14 allergens venues must declare. Shown under the nutrition panel.">
          <ul className="flex flex-wrap gap-1.5">
            {ALLERGENS.map((a) => {
              const on = draft.allergens.includes(a);
              return (
                <li key={a}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("allergens", on ? draft.allergens.filter((x) => x !== a) : [...draft.allergens, a])}
                    className={cn(
                      "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-500",
                      on
                        ? "border-neutral-900 bg-neutral-900! text-white"
                        : "border-neutral-200 bg-white! text-neutral-700 hover:bg-neutral-50!",
                    )}
                  >
                    {a}
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>

        {editing ? (
          <Section title="Danger zone">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 p-3">
              <div>
                <p className="text-[14px] font-medium">Delete this product</p>
                <p className="text-[13px] text-neutral-500">Past orders keep their receipts. This can’t be undone.</p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(editing)}
                className="inline-flex h-8 shrink-0 items-center rounded-full border border-red-200 bg-white! px-3 text-[13px] font-medium text-red-600 transition-colors duration-150 hover:bg-red-50!"
              >
                Delete
              </button>
            </div>
          </Section>
        ) : null}
      </form>

      <footer className="flex shrink-0 items-center gap-2 border-t border-neutral-200 bg-white px-5 py-3">
        {editing ? (
          <a
            href={`/${stadiumSlug}/product/${encodeURIComponent(editing.id)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-neutral-600 transition-colors duration-150 hover:text-neutral-900"
          >
            View in shop
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
        <p role="status" className="min-w-0 flex-1 truncate text-[13px] text-red-600">
          {failure ?? fieldsToFix(Object.keys(errors).length)}
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
          form="product-form"
          disabled={saving || uploading}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-neutral-900! px-4 text-[14px] font-medium text-white! transition-colors duration-150 hover:bg-neutral-700! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {saving ? "Saving…" : editing ? "Save changes" : "Create product"}
        </button>
      </footer>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
          <AlertDialogDescription>You have edits that haven’t been saved. They’ll be lost.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction tone="destructive" onClick={close}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SheetContent>
  );
}

type UploadSession = { urls: string[]; saved: string | null };

/** Deletes this session's uploads except the saved one. Runs once per upload: the list is emptied. */
function releaseUploads(session: UploadSession, discard: (urls: string[]) => Promise<unknown>) {
  const unused = session.urls.filter((u) => u !== session.saved);
  session.urls = [];
  if (unused.length > 0) discard(unused).catch(() => {});
}

function previewOf(draft: ProductDraft, id = "preview"): MenuProduct {
  return {
    id,
    name: draft.name.trim() || "Product name",
    description: draft.description.trim() || null,
    imageUrl: draft.imageUrl,
    priceCents: parseCents(draft.price) ?? 0,
    categoryId: draft.categoryId,
    isSoldOut: draft.isSoldOut,
    nutrition: null,
    allergens: [],
    optionGroups: draft.groups.map((g) => ({
      id: g.key,
      name: g.name,
      selection: g.selection,
      required: g.required,
      maxSelect: null,
      options: [],
    })),
  };
}

function fieldsToFix(count: number) {
  if (count === 0) return "";
  return count === 1 ? "1 field needs fixing" : `${count} fields need fixing`;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="border-b border-neutral-200 px-5 py-5 last:border-b-0">
      <h3 className="text-[14px] font-semibold">{title}</h3>
      {description ? <p className="mt-0.5 text-[13px] text-neutral-500">{description}</p> : null}
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  error,
  aside,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
        <label htmlFor={htmlFor} className="font-medium">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? <p className="mt-1 text-[12px] text-red-600">{error}</p> : null}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-4 px-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{label}</span>
        <span className="block text-[13px] text-neutral-500">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
