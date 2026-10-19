"use client";

import { useState } from "react";
import { Copy, Crosshair, RotateCcw, RotateCw, Settings2, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { aimRow, applySeatCount, fillSection, makeRow, rotation, rowLength, sectionSeatCount, seatCount, stepLabel, suggestFill, toRad, type RowPlan } from "@/lib/seatmap/geometry";
import {
  DECORATION_KINDS,
  MAX_ROWS_PER_SECTION,
  MAX_SEATS_PER_ROW,
  POI_KINDS,
  SEAT_RADIUS,
  SECTION_CODE,
  type SeatMapDoc,
  type SeatMapRow,
  type SeatMapSection,
} from "@/lib/seatmap/schema";
import type { SeatMapIssue } from "@/lib/seatmap/validate";
import { cn } from "@/lib/utils";
import { ColorField, FieldRow, linkButton, NumberField, Panel, smallButton, TextField } from "./fields";
import { findRow, keyOf, splitSelection, transformSelection, updateDecoration, updatePoi, updateRows, updateSection, type Selection } from "./ops";

type Props = {
  doc: SeatMapDoc;
  selection: Selection;
  issues: SeatMapIssue[];
  onChange: (doc: SeatMapDoc, key: string) => void;
  onSelect: (selection: Set<string>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onFocus: () => void;
  onManageCategories: () => void;
  onPlaceFocal: () => void;
};

const NO_CATEGORY = "__none";
const DECORATION_NAMES: Record<(typeof DECORATION_KINDS)[number], string> = { field: "Pitch", stage: "Stage", rect: "Labeled area", ellipse: "Labeled ellipse", text: "Text" };
const POI_NAMES: Record<(typeof POI_KINDS)[number], string> = { kitchen: "Kitchen", pickup: "Pickup point", entrance: "Entrance", exit: "Entrance", stairs: "Stairs" };

export function Inspector(props: Props) {
  const { doc, selection } = props;
  const parts = splitSelection(selection);
  const kinds = [parts.sections.size, parts.rows.size, parts.decorations.size, parts.pois.size].filter(Boolean).length;

  let body: React.ReactNode;
  if (!selection.size) body = <VenuePanel {...props} />;
  else if (kinds > 1 || parts.sections.size > 1 || parts.decorations.size > 1 || parts.pois.size > 1) body = <MultiPanel {...props} />;
  else if (parts.sections.size === 1) {
    const section = doc.sections.find((s) => parts.sections.has(s.id));
    body = section ? <SectionPanel key={section.id} {...props} section={section} /> : null;
  } else if (parts.rows.size) body = <RowsPanel key={[...parts.rows].join()} {...props} ids={parts.rows} />;
  else if (parts.decorations.size) body = <DecorationPanel key={[...parts.decorations][0]} {...props} id={[...parts.decorations][0]} />;
  else body = <PoiPanel key={[...parts.pois][0]} {...props} id={[...parts.pois][0]} />;

  return (
    <aside aria-label="Properties" className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-neutral-200 bg-white">
      {body}
    </aside>
  );
}

function Actions({ onDelete, onDuplicate, onFocus }: Pick<Props, "onDelete" | "onDuplicate" | "onFocus">) {
  return (
    <div className="flex flex-wrap gap-2 px-4 py-4">
      <button type="button" onClick={onFocus} className={smallButton}>
        <Crosshair className="size-3.5" aria-hidden />
        Zoom to
      </button>
      <button type="button" onClick={onDuplicate} className={smallButton}>
        <Copy className="size-3.5" aria-hidden />
        Duplicate
      </button>
      <button type="button" onClick={onDelete} className={cn(smallButton, "text-red-600 hover:bg-red-50!")}>
        <Trash2 className="size-3.5" aria-hidden />
        Delete
      </button>
    </div>
  );
}

function Issues({ issues }: { issues: SeatMapIssue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="mx-4 mt-4 flex flex-col gap-1.5">
      {issues.map((issue, i) => (
        <li
          key={i}
          className={cn(
            "rounded-lg px-2.5 py-2 text-[12px] leading-snug",
            issue.level === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800",
          )}
        >
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

/* ---------- nothing selected ---------- */

function VenuePanel({ doc, onManageCategories, onSelect, onChange, onPlaceFocal }: Props) {
  const rows = doc.sections.reduce((n, s) => n + s.rows.length, 0);
  const seats = seatCount(doc);
  const perCategory = new Map<string | null, number>();
  for (const s of doc.sections) perCategory.set(s.categoryId, (perCategory.get(s.categoryId) ?? 0) + sectionSeatCount(s));

  return (
    <>
      <Panel title="Venue">
        <dl className="grid grid-cols-3 gap-2">
          {[
            ["Sections", doc.sections.length],
            ["Rows", rows],
            ["Seats", seats],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-neutral-50 px-2.5 py-2">
              <dt className="text-[11px] text-neutral-500">{label}</dt>
              <dd className="text-[15px] font-semibold tabular-nums">{Number(value).toLocaleString("en")}</dd>
            </div>
          ))}
        </dl>
        {doc.sections.length ? (
          <button type="button" className={cn(linkButton, "self-start")} onClick={() => onSelect(new Set(doc.sections.map((s) => keyOf("s", s.id))))}>
            Select all sections
          </button>
        ) : null}
      </Panel>
      <Panel title="Focal point">
        <p className="text-[12px] leading-snug text-neutral-500">Stands curve around this point. Put it in the middle of the pitch, then generate the seats in a section.</p>
        {doc.focal ? (
          <>
            <FieldRow label="X" htmlFor="focal-x">
              <NumberField id="focal-x" value={doc.focal.x / 10} suffix="m" step={0.5} onChange={(v) => onChange({ ...doc, focal: { ...doc.focal!, y: doc.focal!.y, x: v * 10 } }, "focal")} />
            </FieldRow>
            <FieldRow label="Y" htmlFor="focal-y">
              <NumberField id="focal-y" value={doc.focal.y / 10} suffix="m" step={0.5} onChange={(v) => onChange({ ...doc, focal: { ...doc.focal!, x: doc.focal!.x, y: v * 10 } }, "focal")} />
            </FieldRow>
          </>
        ) : (
          <p className="text-[13px] text-neutral-600">Not placed yet.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={smallButton} onClick={onPlaceFocal}>
            <Crosshair className="size-3.5" aria-hidden />
            {doc.focal ? "Move" : "Place"}
          </button>
          <button
            type="button"
            className={smallButton}
            onClick={() => {
              const field = doc.decorations.find((d) => d.kind === "field");
              onChange({ ...doc, focal: { x: field?.x ?? 0, y: field?.y ?? 0 } }, "focal");
            }}
          >
            Centre of the pitch
          </button>
        </div>
      </Panel>
      <Panel
        title="Categories"
        action={
          <button type="button" onClick={onManageCategories} className={cn(linkButton, "inline-flex items-center gap-1")}>
            <Settings2 className="size-3.5" aria-hidden />
            Manage
          </button>
        }
      >
        <ul className="flex flex-col gap-1.5">
          {doc.categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 text-[13px]">
              <span className="size-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              <span className="text-neutral-500 tabular-nums">{(perCategory.get(c.id) ?? 0).toLocaleString("en")}</span>
            </li>
          ))}
          {perCategory.get(null) ? (
            <li className="flex items-center gap-2.5 text-[13px] text-neutral-500">
              <span className="size-3 shrink-0 rounded-full bg-neutral-400" aria-hidden />
              <span className="min-w-0 flex-1 truncate">No category</span>
              <span className="tabular-nums">{perCategory.get(null)!.toLocaleString("en")}</span>
            </li>
          ) : null}
        </ul>
      </Panel>
      <Panel title="How to">
        <ul className="flex flex-col gap-1.5 text-[13px] leading-snug text-neutral-600">
          <li>Place the focal point in the middle of the pitch. Every generated block curves around it.</li>
          <li>Draw a section, then set its rows. A single row can have fewer seats, packed at the normal gap or stretched edge to edge.</li>
          <li>Loges, labelled areas and text (T) are names on the map. Tables place chairs around a number.</li>
          <li>Or drag with R for one row, C to bend it, B for a block. Hold Alt to ignore the grid.</li>
          <li>Zoomed in, clicking a seat selects its row. Double-click selects the section.</li>
          <li>Space-drag, right-drag or the hand tool pans. The wheel zooms.</li>
          <li>Drafts save on their own. Publish when the map is ready for the shop.</li>
        </ul>
      </Panel>
    </>
  );
}

/* ---------- several things ---------- */

function MultiPanel({ doc, selection, onChange, onDelete, onDuplicate, onFocus }: Props) {
  const parts = splitSelection(selection);
  const sections = doc.sections.filter((s) => parts.sections.has(s.id));
  const category = sections.length && sections.every((s) => s.categoryId === sections[0].categoryId) ? sections[0].categoryId : undefined;
  const summary = [
    parts.sections.size && `${parts.sections.size} section${parts.sections.size === 1 ? "" : "s"}`,
    parts.rows.size && `${parts.rows.size} row${parts.rows.size === 1 ? "" : "s"}`,
    parts.decorations.size && `${parts.decorations.size} shape${parts.decorations.size === 1 ? "" : "s"}`,
    parts.pois.size && `${parts.pois.size} point${parts.pois.size === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <Panel title="Selection">
        <p className="text-[13px] text-neutral-600">{summary}</p>
        {sections.length ? (
          <FieldRow label="Category" htmlFor="multi-category">
            <CategorySelect
              id="multi-category"
              doc={doc}
              value={category}
              onChange={(categoryId) =>
                onChange({ ...doc, sections: doc.sections.map((s) => (parts.sections.has(s.id) ? { ...s, categoryId } : s)) }, "multi:category")
              }
            />
          </FieldRow>
        ) : null}
        <RotateButtons doc={doc} selection={selection} onChange={onChange} />
      </Panel>
      <Actions onDelete={onDelete} onDuplicate={onDuplicate} onFocus={onFocus} />
    </>
  );
}

function RotateButtons({ doc, selection, onChange }: Pick<Props, "doc" | "selection" | "onChange">) {
  function rotate(by: number) {
    const parts = splitSelection(selection);
    const pts: [number, number][] = [];
    for (const s of doc.sections) {
      if (parts.sections.has(s.id)) pts.push(...(s.points as [number, number][]));
      for (const r of s.rows) if (parts.rows.has(r.id)) pts.push([r.x, r.y]);
    }
    for (const d of doc.decorations) if (parts.decorations.has(d.id)) pts.push([d.x, d.y]);
    for (const p of doc.pois) if (parts.pois.has(p.id)) pts.push([p.x, p.y]);
    if (!pts.length) return;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const px = (Math.min(...xs) + Math.max(...xs)) / 2;
    const py = (Math.min(...ys) + Math.max(...ys)) / 2;
    onChange(transformSelection(doc, selection, rotation(by, px, py)), `rotate:${by}`);
  }
  return (
    <FieldRow label="Rotate">
      <div className="flex gap-1.5">
        <button type="button" onClick={() => rotate(-15)} className={smallButton} aria-label="Rotate 15° left">
          <RotateCcw className="size-3.5" aria-hidden />
          15°
        </button>
        <button type="button" onClick={() => rotate(15)} className={smallButton} aria-label="Rotate 15° right">
          <RotateCw className="size-3.5" aria-hidden />
          15°
        </button>
      </div>
    </FieldRow>
  );
}

function CategorySelect({ id, doc, value, onChange }: { id: string; doc: SeatMapDoc; value: string | null | undefined; onChange: (v: string | null) => void }) {
  return (
    <Select value={value === undefined ? undefined : (value ?? NO_CATEGORY)} onValueChange={(v) => onChange(v === NO_CATEGORY ? null : v)}>
      <SelectTrigger id={id} size="sm" className="w-full">
        <SelectValue placeholder="Mixed" />
      </SelectTrigger>
      <SelectContent align="start">
        {doc.categories.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className="size-3.5 rounded-full" style={{ background: c.color }} aria-hidden />
            {c.label}
          </SelectItem>
        ))}
        <SelectItem value={NO_CATEGORY}>No category</SelectItem>
      </SelectContent>
    </Select>
  );
}

/* ---------- one section ---------- */

function SectionPanel({ doc, section, issues, onChange, onSelect, onDelete, onDuplicate, onFocus, onManageCategories, onPlaceFocal, selection }: Props & { section: SeatMapSection }) {
  const set = (patch: Partial<SeatMapSection>, field: string) => onChange(updateSection(doc, section.id, (s) => ({ ...s, ...patch })), `${section.id}:${field}`);
  const setLabel = (patch: Partial<SeatMapSection["label"]>, field: string) =>
    onChange(updateSection(doc, section.id, (s) => ({ ...s, label: { ...s.label, ...patch } })), `${section.id}:label:${field}`);
  const seats = sectionSeatCount(section);
  const codeTaken = doc.sections.some((s) => s.id !== section.id && s.code === section.code);
  const mine = issues.filter((i) => i.target === `s:${section.id}` || section.rows.some((r) => i.target === `r:${r.id}`));

  return (
    <>
      <Issues issues={mine} />
      <Panel title="Section">
        <FieldRow
          label="Code"
          htmlFor="section-code"
          hint={
            codeTaken ? (
              <span className="text-red-600">Another section uses this code.</span>
            ) : !SECTION_CODE.test(section.code) ? (
              <span className="text-red-600">1–12 capital letters, digits or dashes.</span>
            ) : (
              <span className="text-neutral-500">Used on QR codes and tickets.</span>
            )
          }
        >
          <SectionCodeField section={section} onCommit={(code) => set({ code, name: section.name.endsWith(section.code) ? section.name.slice(0, -section.code.length) + code : section.name }, "code")} />
        </FieldRow>
        <FieldRow label="Name" htmlFor="section-name">
          <TextField id="section-name" value={section.name} maxLength={60} accept={(v) => Boolean(v.trim())} onChange={(name) => set({ name }, "name")} />
        </FieldRow>
        <FieldRow label="Category" htmlFor="section-category">
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <CategorySelect id="section-category" doc={doc} value={section.categoryId} onChange={(categoryId) => set({ categoryId }, "category")} />
            </div>
            <button type="button" onClick={onManageCategories} aria-label="Manage categories" title="Manage categories" className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100! hover:text-neutral-900">
              <Settings2 className="size-4" aria-hidden />
            </button>
          </div>
        </FieldRow>
        {section.display === "round-table" || section.display === "rect-table" ? (
          <TableFields doc={doc} section={section} onChange={onChange} />
        ) : (
          <>
            <FieldRow label="Shown as" htmlFor="section-display">
              <Select value={section.display === "block" ? "block" : "seats"} onValueChange={(display) => set({ display: display as SeatMapSection["display"] }, "display")}>
                <SelectTrigger id="section-display" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="seats">Seats</SelectItem>
                  <SelectItem value="block">Loge</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            {section.display === "block" ? (
              <p className="text-[12px] leading-snug text-neutral-500">A solid labelled area. Switch it back to seats to show its rows again.</p>
            ) : (
              <>
                <FieldRow label="Seats">
                  <p className="text-[13px] tabular-nums">
                    {seats.toLocaleString("en")} in {section.rows.length} row{section.rows.length === 1 ? "" : "s"}
                  </p>
                </FieldRow>
                <SeatingBlock doc={doc} section={section} onChange={onChange} onPlaceFocal={onPlaceFocal} />
              </>
            )}
          </>
        )}
        {section.rows.length ? (
          <button type="button" className={cn(linkButton, "self-start")} onClick={() => onSelect(new Set(section.rows.map((r) => keyOf("r", r.id))))}>
            Select its rows
          </button>
        ) : null}
        <RotateButtons doc={doc} selection={selection} onChange={onChange} />
      </Panel>
      <Panel title="Label">
        <FieldRow label="Shown text" htmlFor="label-text">
          <TextField id="label-text" value={section.label.text} placeholder={section.code} maxLength={24} onChange={(text) => setLabel({ text }, "text")} />
        </FieldRow>
        <FieldRow label="Visible" htmlFor="label-visible">
          <Switch id="label-visible" checked={section.label.visible} onCheckedChange={(visible) => setLabel({ visible }, "visible")} />
        </FieldRow>
        <FieldRow label="Size" htmlFor="label-size">
          <NumberField id="label-size" value={section.label.size} min={4} max={400} onChange={(size) => setLabel({ size }, "size")} digits={1} />
        </FieldRow>
        <FieldRow label="Rotation" htmlFor="label-rotation">
          <NumberField id="label-rotation" value={section.label.rotation} suffix="°" step={5} onChange={(r) => setLabel({ rotation: r }, "rotation")} />
        </FieldRow>
        <FieldRow label="Offset X" htmlFor="label-dx">
          <NumberField id="label-dx" value={section.label.dx / 10} suffix="m" step={0.5} onChange={(v) => setLabel({ dx: v * 10 }, "dx")} />
        </FieldRow>
        <FieldRow label="Offset Y" htmlFor="label-dy">
          <NumberField id="label-dy" value={section.label.dy / 10} suffix="m" step={0.5} onChange={(v) => setLabel({ dy: v * 10 }, "dy")} />
        </FieldRow>
      </Panel>
      <Panel title="Directions">
        <FieldRow label="Entrance" htmlFor="section-entrance" hint={<span className="text-neutral-500">For runners and the delivery map, e.g. “Gate C, stairs 12”.</span>}>
          <TextField id="section-entrance" value={section.entrance} maxLength={40} onChange={(entrance) => set({ entrance }, "entrance")} />
        </FieldRow>
      </Panel>
      <Actions onDelete={onDelete} onDuplicate={onDuplicate} onFocus={onFocus} />
    </>
  );
}

/** Generates rows that follow the section outline and face the focal point. */
function SeatingBlock({ doc, section, onChange, onPlaceFocal }: Pick<Props, "doc" | "onChange" | "onPlaceFocal"> & { section: SeatMapSection }) {
  const focal = doc.focal ? ([doc.focal.x, doc.focal.y] as [number, number]) : null;
  const guess = focal ? suggestFill(section.points, focal) : { rows: 10, seats: 16 };
  const [rows, setRows] = useState(guess.rows);
  const [seats, setSeats] = useState(guess.seats);
  const [plan, setPlan] = useState<Record<number, RowPlan>>({});
  const [error, setError] = useState<string | null>(null);

  function setRowCount(n: number) {
    const count = Math.round(n);
    setRows(count);
    setPlan((prev) => {
      const next: Record<number, RowPlan> = {};
      for (const [key, value] of Object.entries(prev)) if (Number(key) < count) next[Number(key)] = value;
      return next;
    });
  }

  function setRow(i: number, patch: Partial<RowPlan>) {
    setPlan((prev) => ({ ...prev, [i]: { seats: prev[i]?.seats ?? seats, spread: prev[i]?.spread ?? "packed", ...patch } }));
  }

  function generate() {
    if (!doc.focal) return;
    const spec = Array.from({ length: rows }, (_, i) => plan[i] ?? { seats, spread: "packed" as const });
    const result = fillSection(section.points, [doc.focal.x, doc.focal.y], { rows, seats, plan: spec });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    let label = "1";
    const made = result.rows.map((row, i) => makeRow({ ...row, label: i === 0 ? label : (label = stepLabel(label, 1)) }));
    onChange(updateSection(doc, section.id, (s) => ({ ...s, rows: made })), `${section.id}:fill`);
  }

  return (
    <div className="mt-1 flex flex-col gap-2.5 rounded-xl bg-neutral-50 p-3">
      <p className="text-[12px] leading-snug text-neutral-500">Rows curve around the focal point. Give one row fewer seats, then choose whether they keep the normal gap or stretch from edge to edge.</p>
      <FieldRow label="Rows" htmlFor="fill-rows">
        <NumberField id="fill-rows" value={rows} min={1} max={MAX_ROWS_PER_SECTION} digits={0} onChange={setRowCount} />
      </FieldRow>
      <FieldRow label="Seats on the widest row" htmlFor="fill-seats">
        <NumberField id="fill-seats" value={seats} min={1} max={MAX_SEATS_PER_ROW} digits={0} onChange={(n) => setSeats(Math.round(n))} />
      </FieldRow>
      <div className="flex max-h-52 flex-col gap-1.5 overflow-y-auto pr-1">
        {Array.from({ length: rows }, (_, i) => {
          const spec = plan[i];
          const count = spec?.seats ?? seats;
          const spread = spec?.spread ?? "packed";
          return (
            <div key={i} className="grid grid-cols-[3.25rem_4.5rem_1fr] items-center gap-1.5">
              <span className="text-[12px] text-neutral-500 tabular-nums">Row {i + 1}</span>
              <NumberField id={`fill-row-${i}`} value={count} min={1} max={MAX_SEATS_PER_ROW} digits={0} onChange={(n) => setRow(i, { seats: Math.round(n) })} />
              <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5">
                <button type="button" onClick={() => setRow(i, { spread: "packed" })} className={cn("h-6 flex-1 rounded-md px-1 text-[11px] font-medium", spread === "packed" ? "bg-neutral-900 text-white" : "text-neutral-500")}>
                  Normal
                </button>
                <button type="button" onClick={() => setRow(i, { spread: "edge" })} className={cn("h-6 flex-1 rounded-md px-1 text-[11px] font-medium", spread === "edge" ? "bg-neutral-900 text-white" : "text-neutral-500")}>
                  Edge
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {doc.focal ? (
        <button type="button" className={smallButton} onClick={generate}>
          {section.rows.length ? "Replace seating" : "Generate seating"}
        </button>
      ) : (
        <button type="button" className={smallButton} onClick={onPlaceFocal}>
          <Crosshair className="size-3.5" aria-hidden />
          Place a focal point first
        </button>
      )}
      {error ? <p className="text-[12px] leading-snug text-red-600">{error}</p> : null}
    </div>
  );
}

function TableFields({ doc, section, onChange }: Pick<Props, "doc" | "onChange"> & { section: SeatMapSection }) {
  const row = section.rows[0];
  if (!row) return null;
  const round = section.display === "round-table";
  const setRow = (patch: Partial<SeatMapRow>, field: string) =>
    onChange(
      updateSection(doc, section.id, (s) => ({ ...s, rows: s.rows.map((r, i) => (i === 0 ? { ...r, ...patch } : r)) })),
      `${section.id}:${field}`,
    );

  return (
    <>
      <p className="text-[12px] leading-snug text-neutral-500">{round ? "Chairs sit on a circle around the table." : "Chairs sit on the left and right of the table."} Guests book a chair.</p>
      <FieldRow label="Chairs" htmlFor="table-chairs">
        <NumberField id="table-chairs" value={row.seats} min={1} max={24} digits={0} onChange={(n) => setRow({ seats: Math.round(n) }, "chairs")} />
      </FieldRow>
      {round ? (
        <FieldRow label="Open spaces" htmlFor="table-open" hint={<span className="text-neutral-500">Empty places between chairs.</span>}>
          <NumberField
            id="table-open"
            value={row.gaps.length}
            min={0}
            max={12}
            digits={0}
            onChange={(n) => setRow({ gaps: Array.from({ length: Math.round(n) }, () => 0) }, "open")}
          />
        </FieldRow>
      ) : null}
      <FieldRow label={round ? "Diameter" : "Width"} htmlFor="table-w">
        <NumberField
          id="table-w"
          value={row.boxW / 10}
          suffix="m"
          step={0.1}
          min={0.8}
          onChange={(n) => {
            const boxW = n * 10;
            setRow(round ? { boxW, boxH: boxW } : { boxW }, "size");
          }}
        />
      </FieldRow>
      {round ? null : (
        <FieldRow label="Depth" htmlFor="table-h">
          <NumberField id="table-h" value={row.boxH / 10} suffix="m" step={0.1} min={0.8} onChange={(n) => setRow({ boxH: n * 10 }, "depth")} />
        </FieldRow>
      )}
      <FieldRow label="Rotation" htmlFor="table-rotation">
        <NumberField id="table-rotation" value={row.rotation} suffix="°" step={5} onChange={(n) => setRow({ rotation: n }, "rotation")} />
      </FieldRow>
    </>
  );
}

/** Commits only valid codes so a half-typed value never reaches the document. */
function SectionCodeField({ section, onCommit }: { section: SeatMapSection; onCommit: (code: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? section.code;
  return (
    <input
      id="section-code"
      value={shown}
      maxLength={12}
      aria-invalid={!SECTION_CODE.test(shown) || undefined}
      onChange={(e) => {
        const code = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
        setText(code);
        if (SECTION_CODE.test(code)) onCommit(code);
      }}
      onBlur={() => setText(null)}
      className="h-8 w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-2.5 text-[13px] text-neutral-900 uppercase outline-none tabular-nums transition-[border-color,box-shadow] focus-visible:border-blue-500 focus-visible:ring-3 focus-visible:ring-blue-500/15 aria-invalid:border-red-500"
    />
  );
}

/* ---------- rows ---------- */

function common<T>(values: T[]): T | null {
  return values.length && values.every((v) => v === values[0]) ? values[0] : null;
}

function RowsPanel({ doc, ids, issues, onChange, onSelect, onDelete, onDuplicate, onFocus, selection }: Props & { ids: ReadonlySet<string> }) {
  const found = [...ids].map((id) => findRow(doc, id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (!found.length) return null;
  const rows = found.map((f) => f.row);
  const single = rows.length === 1 ? rows[0] : null;
  const sections = [...new Map(found.map((f) => [f.section.id, f.section])).values()];
  const key = [...ids].sort().join(",").slice(0, 80);
  const patch = (fn: (r: SeatMapRow, i: number) => SeatMapRow, field: string) => onChange(updateRows(doc, ids, fn), `${key}:${field}`);
  const seats = rows.reduce((n, r) => n + r.seats, 0);
  const mine = issues.filter((i) => rows.some((r) => i.target === `r:${r.id}`));

  // Order rows front to back along the first row's normal, for spacing and labels.
  const base = rows[0];
  const nx = -Math.sin(toRad(base.rotation));
  const ny = Math.cos(toRad(base.rotation));
  const ordered = [...rows].sort((a, b) => a.x * nx + a.y * ny - (b.x * nx + b.y * ny));
  const spacing = ordered.length > 1 ? Math.abs((ordered[1].x - ordered[0].x) * nx + (ordered[1].y - ordered[0].y) * ny) : null;

  function setSpacing(meters: number) {
    const step = meters * 10;
    const first = ordered[0];
    const d0 = first.x * nx + first.y * ny;
    const index = new Map(ordered.map((r, i) => [r.id, i]));
    patch((r) => {
      const i = index.get(r.id) ?? 0;
      const shift = d0 + i * step - (r.x * nx + r.y * ny);
      return { ...r, x: r.x + nx * shift, y: r.y + ny * shift };
    }, "spacing");
  }

  function relabel(start: string) {
    if (!start.trim()) return;
    const index = new Map(ordered.map((r, i) => [r.id, i]));
    patch((r) => ({ ...r, label: stepLabel(start.trim(), index.get(r.id) ?? 0) || r.label }), "labels");
  }

  return (
    <>
      <Issues issues={mine} />
      <Panel
        title={single ? `Row ${single.label}` : `${rows.length} rows`}
        action={
          sections.length === 1 ? (
            <button type="button" className={linkButton} onClick={() => onSelect(new Set([keyOf("s", sections[0].id)]))}>
              Section {sections[0].code}
            </button>
          ) : null
        }
      >
        {single ? (
          <FieldRow label="Label" htmlFor="row-label">
            <TextField id="row-label" value={single.label} maxLength={8} accept={(v) => Boolean(v.trim())} onChange={(label) => patch((r) => ({ ...r, label: label.trim() }), "label")} />
          </FieldRow>
        ) : (
          <FieldRow label="Label from" htmlFor="row-labels" hint={<span className="text-neutral-500">Front to back: 1, 2, 3… or A, B, C…</span>}>
            <TextField id="row-labels" value={ordered[0].label} maxLength={8} accept={(v) => Boolean(v.trim())} onChange={relabel} />
          </FieldRow>
        )}
        <FieldRow label={rows.every((r) => r.layout !== "line") ? "Chairs" : "Seats"} htmlFor="row-seats" hint={!single ? <span className="text-neutral-500">{seats.toLocaleString("en")} in total</span> : undefined}>
          <NumberField id="row-seats" value={common(rows.map((r) => r.seats))} min={1} max={MAX_SEATS_PER_ROW} digits={0} onChange={(n) => patch((r) => applySeatCount(r, n, r.spread), "seats")} />
        </FieldRow>
        {rows.every((r) => r.layout === "line") ? (
          <FieldRow label="Distribution" htmlFor="row-spread" hint={<span className="text-neutral-500">Normal keeps the gap and shortens the row. Edge spreads the seats from end to end.</span>}>
            <Select
              value={common(rows.map((r) => r.spread)) ?? undefined}
              onValueChange={(spread) => patch((r) => applySeatCount(r, r.seats, spread as RowPlan["spread"]), "spread")}
            >
              <SelectTrigger id="row-spread" size="sm" className="w-full">
                <SelectValue placeholder="Mixed" />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="packed">Normal spacing</SelectItem>
                <SelectItem value="edge">Edge to edge</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        ) : null}
        <FieldRow label="Rotation" htmlFor="row-rotation">
          <NumberField id="row-rotation" value={common(rows.map((r) => r.rotation))} suffix="°" step={1} onChange={(n) => patch((r) => ({ ...r, rotation: n }), "rotation")} />
        </FieldRow>
        {rows.every((r) => r.layout === "line") ? (
          <>
            <FieldRow label="Curve" htmlFor="row-curve">
              <NumberField id="row-curve" value={common(rows.map((r) => r.curve))} suffix="°" step={1} min={-270} max={270} onChange={(n) => patch((r) => ({ ...r, curve: n }), "curve")} />
            </FieldRow>
            <FieldRow label="Seat spacing" htmlFor="row-pitch">
              <NumberField
                id="row-pitch"
                value={common(rows.map((r) => r.pitch / 10))}
                suffix="m"
                step={0.05}
                min={(SEAT_RADIUS * 2) / 10}
                max={6}
                onChange={(n) => patch((r) => ({ ...r, pitch: n * 10 }), "pitch")}
              />
            </FieldRow>
          </>
        ) : null}
        {rows.every((r) => r.layout === "ring") ? (
          <FieldRow label="Open spaces" htmlFor="row-open" hint={<span className="text-neutral-500">Empty places between the chairs.</span>}>
            <NumberField id="row-open" value={common(rows.map((r) => r.gaps.length))} min={0} max={12} digits={0} onChange={(n) => patch((r) => ({ ...r, gaps: Array.from({ length: Math.round(n) }, () => 0) }), "open")} />
          </FieldRow>
        ) : null}
        {!single && rows.every((r) => r.layout === "line") ? (
          <FieldRow label="Row spacing" htmlFor="row-spacing">
            <NumberField id="row-spacing" value={spacing === null ? null : spacing / 10} suffix="m" step={0.05} min={0.3} max={10} onChange={setSpacing} />
          </FieldRow>
        ) : null}
      </Panel>
      <Panel title="Seat numbers">
        <FieldRow label="Start at" htmlFor="row-start">
          <NumberField id="row-start" value={common(rows.map((r) => r.start))} min={0} max={9999} digits={0} onChange={(n) => patch((r) => ({ ...r, start: Math.round(n) }), "start")} />
        </FieldRow>
        <FieldRow label="Right to left" htmlFor="row-reverse">
          <Switch id="row-reverse" checked={common(rows.map((r) => r.reverse)) ?? false} onCheckedChange={(reverse) => patch((r) => ({ ...r, reverse }), "reverse")} />
        </FieldRow>
        {rows.every((r) => r.layout === "line") ? (
          <FieldRow label="Aisle after" htmlFor="row-gaps" hint={<span className="text-neutral-500">Seat numbers followed by a gap, e.g. 8, 16.</span>}>
            <GapsField rows={rows} onChange={(gaps) => patch((r) => ({ ...r, gaps }), "gaps")} />
          </FieldRow>
        ) : null}
        <FieldRow label="Wheelchair" htmlFor="row-wheel" hint={<span className="text-neutral-500">Seat numbers that show a wheelchair icon, e.g. 1, 4.</span>}>
          <WheelchairField rows={rows} onChange={(wheelchair) => patch((r) => ({ ...r, wheelchair }), "wheelchair")} />
        </FieldRow>
        {single ? (
          <p className="text-[12px] text-neutral-500 tabular-nums">
            Seats {single.start}–{single.start + single.seats - 1} · {(rowLength(single) / 10).toFixed(1)} m long
          </p>
        ) : null}
      </Panel>
      <Panel title="Position">
        <RotateButtons doc={doc} selection={selection} onChange={onChange} />
        {doc.focal ? (
          <button
            type="button"
            className={cn(smallButton, "self-start")}
            onClick={() => {
              const point: [number, number] = [doc.focal!.x, doc.focal!.y];
              patch((r) => aimRow(r, point), "aim");
            }}
          >
            <Crosshair className="size-3.5" aria-hidden />
            Curve toward the focal point
          </button>
        ) : null}
      </Panel>
      <Actions onDelete={onDelete} onDuplicate={onDuplicate} onFocus={onFocus} />
    </>
  );
}

function WheelchairField({ rows, onChange }: { rows: SeatMapRow[]; onChange: (wheelchair: number[]) => void }) {
  const shared = common(rows.map((r) => r.wheelchair.join(", ")));
  return (
    <TextField
      id="row-wheel"
      value={shared ?? ""}
      placeholder={shared === null ? "Mixed" : "None"}
      maxLength={120}
      onChange={(text) => {
        const wheelchair = [...new Set(text.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n >= 0))].slice(0, 80).sort((a, b) => a - b);
        onChange(wheelchair);
      }}
    />
  );
}

function GapsField({ rows, onChange }: { rows: SeatMapRow[]; onChange: (gaps: number[]) => void }) {
  const shared = common(rows.map((r) => r.gaps.join(", ")));
  return (
    <TextField
      id="row-gaps"
      value={shared ?? ""}
      placeholder={shared === null ? "Mixed" : "None"}
      maxLength={120}
      onChange={(text) => {
        const gaps = [...new Set(text.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n >= 0))].slice(0, 40).sort((a, b) => a - b);
        onChange(gaps);
      }}
    />
  );
}

/* ---------- shapes & points ---------- */

function DecorationPanel({ doc, id, onChange, onDelete, onDuplicate, onFocus }: Props & { id: string }) {
  const d = doc.decorations.find((x) => x.id === id);
  if (!d) return null;
  const set = (patch: Partial<typeof d>, field: string) => onChange(updateDecoration(doc, id, patch), `${id}:${field}`);
  const text = d.kind === "text";
  return (
    <>
      <Panel title={DECORATION_NAMES[d.kind]}>
        {d.kind !== "field" ? (
          <FieldRow label={text ? "Text" : "Label"} htmlFor="deco-label">
            <TextField id="deco-label" value={d.label} maxLength={60} onChange={(label) => set({ label }, "label")} />
          </FieldRow>
        ) : null}
        {text ? (
          <FieldRow label="Size" htmlFor="deco-size">
            <NumberField id="deco-size" value={d.h / 10} suffix="m" step={0.5} min={0.2} onChange={(n) => set({ h: n * 10 }, "h")} />
          </FieldRow>
        ) : (
          <>
            <FieldRow label="Width" htmlFor="deco-w">
              <NumberField id="deco-w" value={d.w / 10} suffix="m" step={0.5} min={0.2} onChange={(n) => set({ w: n * 10 }, "w")} />
            </FieldRow>
            <FieldRow label="Height" htmlFor="deco-h">
              <NumberField id="deco-h" value={d.h / 10} suffix="m" step={0.5} min={0.2} onChange={(n) => set({ h: n * 10 }, "h")} />
            </FieldRow>
          </>
        )}
        <FieldRow label="Rotation" htmlFor="deco-rotation">
          <NumberField id="deco-rotation" value={d.rotation} suffix="°" step={5} onChange={(n) => set({ rotation: n }, "rotation")} />
        </FieldRow>
        {d.kind !== "stage" ? (
          <FieldRow label="Colour" htmlFor="deco-color">
            <ColorField id="deco-color" value={d.color} onChange={(color) => set({ color }, "color")} />
          </FieldRow>
        ) : null}
      </Panel>
      <Actions onDelete={onDelete} onDuplicate={onDuplicate} onFocus={onFocus} />
    </>
  );
}

function PoiPanel({ doc, id, onChange, onDelete, onDuplicate, onFocus }: Props & { id: string }) {
  const p = doc.pois.find((x) => x.id === id);
  if (!p) return null;
  const shaped = p.kind === "stairs" || p.kind === "entrance" || p.kind === "exit";
  return (
    <>
      <Panel title={p.kind === "stairs" ? "Stairs" : p.kind === "entrance" || p.kind === "exit" ? "Entrance" : "Point"}>
        <FieldRow label="Type" htmlFor="poi-kind">
          <Select
            value={p.kind === "exit" ? "entrance" : p.kind}
            onValueChange={(kind) => {
              const next = kind as typeof p.kind;
              const grow = (next === "stairs" || next === "entrance" || next === "exit") && p.w === 0;
              onChange(
                updatePoi(doc, id, grow ? { kind: next, w: next === "stairs" ? 16 : 40, h: next === "stairs" ? 80 : 32 } : { kind: next }),
                `${id}:kind`,
              );
            }}
          >
            <SelectTrigger id="poi-kind" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {POI_KINDS.filter((k) => k !== "exit").map((k) => (
                <SelectItem key={k} value={k}>
                  {POI_NAMES[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Label" htmlFor="poi-label">
          <TextField id="poi-label" value={p.label} maxLength={40} placeholder={shaped ? "A" : undefined} onChange={(label) => onChange(updatePoi(doc, id, { label }), `${id}:label`)} />
        </FieldRow>
        {shaped ? (
          <>
            <FieldRow label="Width" htmlFor="poi-w">
              <NumberField id="poi-w" value={p.w / 10} suffix="m" step={0.1} min={0.4} onChange={(n) => onChange(updatePoi(doc, id, { w: n * 10 }), `${id}:w`)} />
            </FieldRow>
            <FieldRow label="Height" htmlFor="poi-h">
              <NumberField id="poi-h" value={p.h / 10} suffix="m" step={0.1} min={0.4} onChange={(n) => onChange(updatePoi(doc, id, { h: n * 10 }), `${id}:h`)} />
            </FieldRow>
            <FieldRow label="Rotation" htmlFor="poi-rotation" hint={<span className="text-neutral-500">{p.kind === "stairs" ? "Turn the bar so it sits in the aisle." : "0 points up the map."}</span>}>
              <NumberField id="poi-rotation" value={p.rotation} suffix="°" step={5} onChange={(n) => onChange(updatePoi(doc, id, { rotation: n }), `${id}:rotation`)} />
            </FieldRow>
          </>
        ) : (
          <p className="text-[12px] leading-snug text-neutral-500">Kitchens and pickup points are stops a future runner-direction map routes between.</p>
        )}
      </Panel>
      <Actions onDelete={onDelete} onDuplicate={onDuplicate} onFocus={onFocus} />
    </>
  );
}
