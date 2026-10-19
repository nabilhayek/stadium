"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { VenueSection } from "@/lib/management/seat-map";
import { bowlTemplate, DEFAULT_BOWL, sectionSeatCount, type BowlOptions } from "@/lib/seatmap/geometry";
import { CATEGORY_PALETTE, newId, type SeatMapCategory, type SeatMapDoc } from "@/lib/seatmap/schema";
import type { SeatMapIssue } from "@/lib/seatmap/validate";
import { cn } from "@/lib/utils";
import { ColorField, FieldRow, NumberField, TextField } from "./fields";

const primary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-full bg-neutral-900! px-4 text-[14px] font-medium text-white! transition-colors duration-150 hover:bg-neutral-700! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50";

/* ---------- categories ---------- */

export function CategoriesDialog({ open, doc, onOpenChange, onSave }: { open: boolean; doc: SeatMapDoc; onOpenChange: (open: boolean) => void; onSave: (doc: SeatMapDoc) => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[480px]">{open ? <CategoriesForm doc={doc} onCancel={() => onOpenChange(false)} onSave={onSave} /> : null}</AlertDialogContent>
    </AlertDialog>
  );
}

function CategoriesForm({ doc, onCancel, onSave }: { doc: SeatMapDoc; onCancel: () => void; onSave: (doc: SeatMapDoc) => void }) {
  const [list, setList] = useState<SeatMapCategory[]>(doc.categories);
  const usage = new Map<string, number>();
  for (const s of doc.sections) if (s.categoryId) usage.set(s.categoryId, (usage.get(s.categoryId) ?? 0) + 1);
  const valid = list.every((c) => c.label.trim());

  function save() {
    const ids = new Set(list.map((c) => c.id));
    onSave({
      ...doc,
      categories: list.map((c) => ({ ...c, label: c.label.trim() })),
      sections: doc.sections.map((s) => (s.categoryId && !ids.has(s.categoryId) ? { ...s, categoryId: null } : s)),
    });
  }

  return (
    <>
      <AlertDialogTitle>Categories</AlertDialogTitle>
      <AlertDialogDescription>Price tiers or areas. Sections take their colour from their category.</AlertDialogDescription>
      <ul className="mt-4 flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
        {list.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2">
            <div className="w-[132px] shrink-0">
              <ColorField id={`cat-color-${c.id}`} value={c.color} onChange={(color) => setList((l) => l.map((x) => (x.id === c.id ? { ...x, color } : x)))} />
            </div>
            <div className="min-w-0 flex-1">
              <TextField id={`cat-label-${c.id}`} value={c.label} maxLength={40} invalid={!c.label.trim()} placeholder={`Category ${i + 1}`} onChange={(label) => setList((l) => l.map((x) => (x.id === c.id ? { ...x, label } : x)))} />
            </div>
            <span className="w-16 shrink-0 text-right text-[12px] text-neutral-500 tabular-nums">{usage.get(c.id) ?? 0} sect.</span>
            <button
              type="button"
              onClick={() => setList((l) => l.filter((x) => x.id !== c.id))}
              aria-label={`Delete ${c.label || "category"}`}
              title={usage.get(c.id) ? "Its sections become uncategorised" : "Delete"}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-500 hover:bg-red-50! hover:text-red-600"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={list.length >= 20}
        onClick={() => setList((l) => [...l, { id: newId("c"), label: "", color: CATEGORY_PALETTE[l.length % CATEGORY_PALETTE.length] }])}
        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-neutral-200 bg-white! px-3 text-[13px] font-medium hover:bg-neutral-50! disabled:opacity-50"
      >
        <Plus className="size-3.5" aria-hidden />
        Add category
      </button>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
        <button type="button" disabled={!valid} onClick={save} className={primary}>
          Save
        </button>
      </AlertDialogFooter>
    </>
  );
}

/* ---------- stadium template ---------- */

export function TemplateDialog({ open, doc, onOpenChange, onApply }: { open: boolean; doc: SeatMapDoc; onOpenChange: (open: boolean) => void; onApply: (doc: SeatMapDoc) => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[520px]">{open ? <TemplateForm doc={doc} onCancel={() => onOpenChange(false)} onApply={onApply} /> : null}</AlertDialogContent>
    </AlertDialog>
  );
}

function TemplateForm({ doc, onCancel, onApply }: { doc: SeatMapDoc; onCancel: () => void; onApply: (doc: SeatMapDoc) => void }) {
  const [options, setOptions] = useState<BowlOptions>(() => ({
    ...DEFAULT_BOWL,
    rings: DEFAULT_BOWL.rings.map((r, i) => ({ ...r, categoryId: doc.categories[i]?.id ?? doc.categories[0]?.id ?? null })),
  }));
  const [ringCount, setRingCount] = useState(3);
  const used = { ...options, rings: options.rings.slice(0, ringCount) };
  const estimate = used.rings.reduce((n, r, i) => {
    // Rough perimeter of the ring's middle row: good enough for a preview number.
    const inner = used.apron + used.rings.slice(0, i).reduce((d, x) => d + x.rows * used.rowPitch + used.concourse, 0) + (r.rows * used.rowPitch) / 2;
    const a = used.fieldWidth / 2 + inner;
    const b = used.fieldHeight / 2 + inner;
    const perimeter = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))) * 1.06;
    return n + Math.round(((perimeter - r.sections * (used.aisle + 20)) / used.seatPitch) * r.rows);
  }, 0);
  const replacing = doc.sections.length > 0 || doc.decorations.length > 0;

  const setRing = (i: number, patch: Partial<BowlOptions["rings"][number]>) =>
    setOptions((o) => ({ ...o, rings: o.rings.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  return (
    <>
      <AlertDialogTitle>Start from a stadium bowl</AlertDialogTitle>
      <AlertDialogDescription>Rings of sections around a pitch, with rows and seats filled in. Adjust anything afterwards.</AlertDialogDescription>
      <div className="mt-4 flex flex-col gap-2.5">
        <FieldRow label="Rings" htmlFor="tpl-rings">
          <NumberField id="tpl-rings" value={ringCount} min={1} max={3} digits={0} onChange={(n) => setRingCount(Math.round(n))} />
        </FieldRow>
        <FieldRow label="Pitch size" htmlFor="tpl-w">
          <div className="flex items-center gap-1.5">
            <NumberField id="tpl-w" value={options.fieldWidth / 10} suffix="m" min={20} max={300} digits={0} onChange={(n) => setOptions((o) => ({ ...o, fieldWidth: n * 10 }))} />
            <span className="text-neutral-400">×</span>
            <NumberField id="tpl-h" value={options.fieldHeight / 10} suffix="m" min={20} max={300} digits={0} onChange={(n) => setOptions((o) => ({ ...o, fieldHeight: n * 10 }))} />
          </div>
        </FieldRow>
        <FieldRow label="Shape" htmlFor="tpl-square" hint={<span className="text-neutral-500">2 is oval; 4 hugs the pitch like a modern stadium.</span>}>
          <NumberField id="tpl-square" value={options.squareness} min={2} max={6} step={0.5} digits={1} onChange={(n) => setOptions((o) => ({ ...o, squareness: n }))} />
        </FieldRow>
        <div className="mt-1 grid grid-cols-[1fr_72px_88px] items-center gap-x-2 gap-y-1.5 text-[13px]">
          <span className="text-[12px] text-neutral-500">Ring</span>
          <span className="text-[12px] text-neutral-500">Rows</span>
          <span className="text-[12px] text-neutral-500">Sections</span>
          {options.rings.slice(0, ringCount).map((r, i) => (
            <div key={i} className="contents">
              <TextField id={`tpl-name-${i}`} value={r.name} maxLength={30} accept={(v) => Boolean(v.trim())} onChange={(name) => setRing(i, { name })} />
              <NumberField id={`tpl-rows-${i}`} value={r.rows} min={1} max={60} digits={0} onChange={(n) => setRing(i, { rows: Math.round(n) })} />
              <NumberField id={`tpl-sections-${i}`} value={r.sections} min={4} max={80} digits={0} onChange={(n) => setRing(i, { sections: Math.round(n) })} />
            </div>
          ))}
        </div>
        <p className="text-[13px] text-neutral-600">
          About <span className="font-semibold tabular-nums">{estimate.toLocaleString("en")}</span> seats in {used.rings.reduce((n, r) => n + r.sections, 0)} sections.
        </p>
        {replacing ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            This replaces the sections, shapes and points on the current draft. Undo brings them back.
          </p>
        ) : null}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
        <button type="button" onClick={() => onApply(bowlTemplate(doc, used))} className={primary}>
          {replacing ? "Replace draft" : "Create bowl"}
        </button>
      </AlertDialogFooter>
    </>
  );
}

/* ---------- publish ---------- */

export type SectionDiff = { added: VenueSection[]; renamed: { code: string; from: string; to: string }[]; removed: VenueSection[]; unchanged: number };

export function diffSections(doc: SeatMapDoc, live: VenueSection[]): SectionDiff {
  const current = new Map(live.map((s) => [s.code, s]));
  const onMap = new Set(doc.sections.map((s) => s.code));
  const diff: SectionDiff = { added: [], renamed: [], removed: [], unchanged: 0 };
  for (const s of doc.sections) {
    const was = current.get(s.code);
    if (!was) diff.added.push({ code: s.code, name: s.name });
    else if (was.name !== s.name) diff.renamed.push({ code: s.code, from: was.name, to: s.name });
    else diff.unchanged++;
  }
  for (const s of live) if (!onMap.has(s.code)) diff.removed.push(s);
  return diff;
}

export function PublishDialog({
  open,
  doc,
  live,
  issues,
  publishing,
  error,
  onOpenChange,
  onPublish,
}: {
  open: boolean;
  doc: SeatMapDoc;
  live: VenueSection[];
  issues: SeatMapIssue[];
  publishing: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onPublish: () => void;
}) {
  const diff = diffSections(doc, live);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const seats = doc.sections.reduce((n, s) => n + sectionSeatCount(s), 0);

  return (
    <AlertDialog open={open} onOpenChange={(o) => !publishing && onOpenChange(o)}>
      <AlertDialogContent className="max-w-[520px]">
        <AlertDialogTitle>Publish seat map</AlertDialogTitle>
        <AlertDialogDescription>
          {doc.sections.length} sections and {seats.toLocaleString("en")} seats go live. The shop’s section list follows the map.
        </AlertDialogDescription>

        <div className="mt-4 flex max-h-[50vh] flex-col gap-3 overflow-y-auto text-[13px]">
          {errors.length ? (
            <div className="rounded-lg bg-red-50 px-3 py-2.5 text-red-800">
              <p className="font-medium">Fix {errors.length === 1 ? "this" : `these ${errors.length}`} first</p>
              <ul className="mt-1 list-disc pl-4">
                {errors.slice(0, 6).map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <DiffList title="New sections" tone="green" items={diff.added.map((s) => `${s.code} · ${s.name}`)} />
          <DiffList title="Renamed" tone="blue" items={diff.renamed.map((s) => `${s.code}: ${s.from} → ${s.to}`)} />
          <DiffList title="Removed from the shop" tone="red" items={diff.removed.map((s) => `${s.code} · ${s.name}`)} note="Sections with past orders are kept so their orders still resolve." />
          {!diff.added.length && !diff.renamed.length && !diff.removed.length ? (
            <p className="text-neutral-600">The shop’s sections already match this map ({diff.unchanged} unchanged).</p>
          ) : diff.unchanged ? (
            <p className="text-neutral-500">{diff.unchanged} sections unchanged.</p>
          ) : null}
          {warnings.length ? <p className="text-amber-800">{warnings.length} warning{warnings.length === 1 ? "" : "s"} in the issues list won’t block publishing.</p> : null}
        </div>

        {error ? <p className="mt-3 text-[13px] text-red-600">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
          <button type="button" disabled={publishing || errors.length > 0} onClick={onPublish} className={primary}>
            {publishing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DiffList({ title, items, tone, note }: { title: string; items: string[]; tone: "green" | "blue" | "red"; note?: string }) {
  if (!items.length) return null;
  const dot = { green: "bg-green-500", blue: "bg-blue-500", red: "bg-red-500" }[tone];
  return (
    <div>
      <p className="flex items-center gap-2 font-medium">
        <span className={cn("size-2 rounded-full", dot)} aria-hidden />
        {title}
        <span className="text-neutral-500 tabular-nums">{items.length}</span>
      </p>
      <ul className="mt-1 max-h-28 overflow-y-auto pl-4 text-neutral-600">
        {items.slice(0, 60).map((item) => (
          <li key={item} className="truncate">
            {item}
          </li>
        ))}
        {items.length > 60 ? <li className="text-neutral-400">and {items.length - 60} more</li> : null}
      </ul>
      {note ? <p className="mt-1 text-[12px] text-neutral-500">{note}</p> : null}
    </div>
  );
}
