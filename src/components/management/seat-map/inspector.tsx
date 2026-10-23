"use client";

import { useRef, useState } from "react";
import { Settings2, TextAlignCenter, TextAlignEnd, TextAlignStart, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  applySeatCount,
  fillSectionGrid,
  detachVenueFollow,
  liveSeatCount,
  numberingPreview,
  rowLength,
  rowNeedsRenumber,
  seatNumber,
  sectionSeatCount,
  seatCount,
  stepLabel,
  toRad,
  venuesOf,
  type Point,
  type RowPlan,
} from "@/lib/seatmap/geometry";
import {
  DECORATION_KINDS,
  MAX_ROWS_PER_SECTION,
  MAX_SEATS_PER_ROW,
  POI_KINDS,
  SEAT_RADIUS,
  SECTION_CODE,
  type SeatMapDoc,
  type SeatMapNumbering,
  type SeatMapRow,
  type SeatMapSection,
} from "@/lib/seatmap/schema";
import type { SeatMapIssue } from "@/lib/seatmap/validate";
import { cn } from "@/lib/utils";
import { ColorField, Disclosure, FieldRow, linkButton, NumberField, Panel, ScaleSlider, Segmented, SliderField, smallButton, TextField } from "./fields";
import {
  addRows,
  alignSelectedRows,
  findRow,
  keyOf,
  renumberRows,
  setWheelchair,
  splitSelection,
  updateDecoration,
  updatePoi,
  updateRows,
  updateSection,
  type SeatPick,
  type Selection,
} from "./ops";

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
  onNotify: (message: string) => void;
};

const NO_CATEGORY = "__none";
const DECORATION_NAMES: Record<(typeof DECORATION_KINDS)[number], string> = {
  field: "Pitch",
  stage: "Stage",
  rect: "Labeled area",
  ellipse: "Labeled ellipse",
  wall: "Rectangle",
  column: "Circle",
  venue: "Venue shape",
  text: "Text",
};
const POI_NAMES: Record<(typeof POI_KINDS)[number], string> = { kitchen: "Kitchen", pickup: "Pickup point", entrance: "Entrance", exit: "Entrance", stairs: "Stairs" };

export function Inspector(props: Props) {
  const { doc, selection } = props;
  const parts = splitSelection(selection);
  const others = parts.sections.size + parts.decorations.size + parts.pois.size;
  const kinds = [parts.sections.size, parts.decorations.size, parts.pois.size, parts.rows.size + parts.seats.length].filter(Boolean).length;

  let body: React.ReactNode;
  if (!selection.size) body = <VenuePanel {...props} />;
  // Whole rows show the row panel. Add a single seat and it is a seat selection: whole rows count as their seats.
  else if (!others && parts.seats.length) body = <SeatsPanel {...props} />;
  else if (!others && parts.rows.size) body = <RowsPanel key={[...parts.rows].join()} {...props} ids={parts.rows} />;
  else if (kinds > 1 || parts.sections.size > 1 || parts.decorations.size > 1 || parts.pois.size > 1) body = <MultiPanel {...props} />;
  else if (parts.sections.size === 1) {
    const section = doc.sections.find((s) => parts.sections.has(s.id));
    body = section ? <SectionPanel key={section.id} {...props} section={section} /> : null;
  } else if (parts.decorations.size) body = <DecorationPanel key={[...parts.decorations][0]} {...props} id={[...parts.decorations][0]} />;
  else body = <PoiPanel key={[...parts.pois][0]} {...props} id={[...parts.pois][0]} />;

  return (
    <aside aria-label="Properties" className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-neutral-200 bg-white">
      {body}
    </aside>
  );
}

/** Compact title at the top of a selection panel: the kind on the left, selection code on the right. */
function Heading({ kind, title, subtitle }: { kind?: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-neutral-200 bg-white px-4 pt-4 pb-3">
      <div className="min-w-0">
        {kind ? <p className="text-[11px] font-medium tracking-wide text-neutral-400 uppercase">{kind}</p> : null}
        <h2 className="truncate text-[16px] font-semibold text-neutral-900">{title}</h2>
        {subtitle ? <p className="truncate text-[12px] text-neutral-500">{subtitle}</p> : null}
      </div>
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

function NumberingDefaults({ doc, onChange }: Pick<Props, "doc" | "onChange">) {
  const n = doc.numbering;
  const set = (patch: { rows?: Partial<SeatMapNumbering["rows"]>; seats?: Partial<SeatMapNumbering["seats"]> }, field: string) =>
    onChange({ ...doc, numbering: { rows: { ...n.rows, ...patch.rows }, seats: { ...n.seats, ...patch.seats } } }, `numbering:${field}`);
  return (
    <Panel title="Numbering defaults">
      <p className="text-[12px] leading-snug text-neutral-500">New rows and seats are labelled this way. Rows you already placed keep their numbers.</p>
      <p className="text-[12px] font-medium text-neutral-800">Rows</p>
      <FieldRow label="Labels" htmlFor="num-row-style">
        <Segmented
          id="num-row-style"
          size="sm"
          value={n.rows.style}
          onChange={(style) => set({ rows: { style } }, "row-style")}
          options={[
            { value: "numbers", label: "1, 2, 3" },
            { value: "roman", label: "I, II, III" },
            { value: "letters", label: "A, B, C" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Start at" htmlFor="num-row-from">
        <NumberField id="num-row-from" value={n.rows.from} min={n.rows.style === "numbers" ? 0 : 1} max={999} digits={0} onChange={(from) => set({ rows: { from: Math.round(from) } }, "row-from")} />
      </FieldRow>
      <FieldRow label="Direction" htmlFor="num-row-dir">
        <Segmented
          id="num-row-dir"
          size="sm"
          value={n.rows.reverse ? "up" : "down"}
          onChange={(v) => set({ rows: { reverse: v === "up" } }, "row-dir")}
          options={[
            { value: "down", label: "Front first", ariaLabel: "Front row first" },
            { value: "up", label: "Back first", ariaLabel: "Back row first" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Step" htmlFor="num-row-step" hint={numberingPreview("rows", n)}>
        <NumberField id="num-row-step" value={n.rows.step} min={1} max={99} digits={0} onChange={(step) => set({ rows: { step: Math.round(step) } }, "row-step")} />
      </FieldRow>
      <p className="mt-1 text-[12px] font-medium text-neutral-800">Seats</p>
      <FieldRow label="Start at" htmlFor="num-seat-from">
        <NumberField id="num-seat-from" value={n.seats.from} min={0} max={9999} digits={0} onChange={(from) => set({ seats: { from: Math.round(from) } }, "seat-from")} />
      </FieldRow>
      <FieldRow label="Direction" htmlFor="num-seat-dir">
        <Segmented
          id="num-seat-dir"
          size="sm"
          value={n.seats.reverse ? "left" : "right"}
          onChange={(v) => set({ seats: { reverse: v === "left" } }, "seat-dir")}
          options={[
            { value: "right", label: "Left → right" },
            { value: "left", label: "Right → left" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Step" htmlFor="num-seat-step" hint={numberingPreview("seats", n)}>
        <NumberField id="num-seat-step" value={n.seats.step} min={1} max={99} digits={0} onChange={(step) => set({ seats: { step: Math.round(step) } }, "seat-step")} />
      </FieldRow>
    </Panel>
  );
}

function VenuePanel(props: Props) {
  const { doc, onManageCategories, onSelect } = props;
  const stands = doc.sections.filter((s) => !s.loose);
  const rows = doc.sections.reduce((n, s) => n + s.rows.length, 0);
  const seats = seatCount(doc);
  const perCategory = new Map<string | null, number>();
  for (const s of doc.sections) perCategory.set(s.categoryId, (perCategory.get(s.categoryId) ?? 0) + sectionSeatCount(s));

  return (
    <>
      <Panel title="Venue">
        <dl className="grid grid-cols-3 gap-2">
          {[
            ["Sections", stands.length],
            ["Rows", rows],
            ["Seats", seats],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-neutral-50 px-2.5 py-2">
              <dt className="text-[11px] text-neutral-500">{label}</dt>
              <dd className="text-[15px] font-semibold tabular-nums">{Number(value).toLocaleString("en")}</dd>
            </div>
          ))}
        </dl>
        {stands.length ? (
          <button type="button" className={cn(linkButton, "self-start")} onClick={() => onSelect(new Set(stands.map((s) => keyOf("s", s.id))))}>
            Select all sections
          </button>
        ) : null}
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
      <NumberingDefaults doc={doc} onChange={props.onChange} />
      <Panel title="How to">
        <ul className="flex flex-col gap-1.5 text-[13px] leading-snug text-neutral-600">
          <li>Draw a section, then draw its rows. A row can have fewer seats, packed at the normal gap or stretched edge to edge.</li>
          <li>Loges, labelled areas and text (T) are names on the map. Tables place chairs around a number.</li>
          <li>Draw seats anywhere. Select unassigned rows and group them into a section — the outline follows the seats.</li>
          <li>Row, curved row and block of rows: click once, move, then click again. A curved row bends until a third click. Hold Alt to ignore the grid.</li>
          <li>Zoomed in, clicking a seat selects its row. Click a chair in that row to pick it. Double-click selects the section.</li>
          <li>Space-drag, right-drag or the hand tool pans. The wheel zooms.</li>
          <li>Drafts save on their own. Publish when the map is ready for the shop.</li>
        </ul>
      </Panel>
    </>
  );
}

/* ---------- several things ---------- */

function MultiPanel({ doc, selection, onChange }: Props) {
  const parts = splitSelection(selection);
  const sections = doc.sections.filter((s) => parts.sections.has(s.id));
  const category = sections.length && sections.every((s) => s.categoryId === sections[0].categoryId) ? sections[0].categoryId : undefined;
  const bits = [
    parts.sections.size && `${parts.sections.size} section${parts.sections.size === 1 ? "" : "s"}`,
    parts.rows.size && `${parts.rows.size} row${parts.rows.size === 1 ? "" : "s"}`,
    parts.decorations.size && `${parts.decorations.size} shape${parts.decorations.size === 1 ? "" : "s"}`,
    parts.pois.size && `${parts.pois.size} point${parts.pois.size === 1 ? "" : "s"}`,
    parts.seats.length && `${parts.seats.length} seat${parts.seats.length === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[];
  const total = parts.sections.size + parts.rows.size + parts.decorations.size + parts.pois.size + parts.seats.length;

  return (
    <>
      <Heading kind="Selection" title={`${total} items`} subtitle={bits.join(" · ")} />
      <Panel title="">
        <p className="text-[12px] leading-snug text-neutral-500">Drag the rotation handle on the canvas to turn them together. Use the floating bar to delete, duplicate or zoom.</p>
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
      </Panel>
    </>
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

function SectionPanel({ doc, section, issues, onChange, onSelect, onManageCategories, onNotify }: Props & { section: SeatMapSection }) {
  const set = (patch: Partial<SeatMapSection>, field: string) => onChange(updateSection(doc, section.id, (s) => ({ ...s, ...patch })), `${section.id}:${field}`);
  const setLabel = (patch: Partial<SeatMapSection["label"]>, field: string) =>
    onChange(updateSection(doc, section.id, (s) => ({ ...s, label: { ...s.label, ...patch } })), `${section.id}:label:${field}`);
  const seats = sectionSeatCount(section);
  const codeTaken = doc.sections.some((s) => s.id !== section.id && s.code === section.code);
  const mine = issues.filter((i) => i.target === `s:${section.id}` || section.rows.some((r) => i.target === `r:${r.id}`));
  const isTable = section.display === "round-table" || section.display === "rect-table";

  return (
    <>
      <Heading
        kind="Section"
        title={section.name || `Section ${section.code}`}
        subtitle={isTable ? `Table · ${section.rows[0]?.seats ?? 0} chairs` : `${seats.toLocaleString("en")} seats · ${section.rows.length} row${section.rows.length === 1 ? "" : "s"}`}
      />
      <Issues issues={mine} />
      <Panel title="">
        <FieldRow
          label="Code"
          htmlFor="section-code"
          hint={
            codeTaken ? (
              <span className="text-red-600">Another section uses this code.</span>
            ) : !SECTION_CODE.test(section.code) ? (
              <span className="text-red-600">1–12 capital letters, digits or dashes.</span>
            ) : null
          }
        >
          <SectionCodeField section={section} onCommit={(code) => set({ code, name: section.name.endsWith(section.code) ? section.name.slice(0, -section.code.length) + code : section.name }, "code")} />
        </FieldRow>
        <FieldRow label="Name" htmlFor="section-name">
          <TextField id="section-name" value={section.name} maxLength={60} accept={(v) => Boolean(v.trim())} onChange={(name) => set({ name }, "name")} />
        </FieldRow>
        <FieldRow label="Category" htmlFor="section-category">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <CategorySelect id="section-category" doc={doc} value={section.categoryId} onChange={(categoryId) => set({ categoryId }, "category")} />
            </div>
            <button
              type="button"
              onClick={onManageCategories}
              aria-label="Manage categories"
              title="Manage categories"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100! hover:text-neutral-900"
            >
              <Settings2 className="size-4" aria-hidden />
            </button>
          </div>
        </FieldRow>
        {isTable ? (
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
            {section.display === "block" ? <p className="text-[12px] leading-snug text-neutral-500">A solid labelled area. Switch it back to seats to show its rows again.</p> : null}
            {section.display === "seats" && !section.rows.length ? <GenerateSeats doc={doc} section={section} onChange={onChange} onSelect={onSelect} /> : null}
          </>
        )}
        {section.rows.length ? (
          <button type="button" className={cn(linkButton, "self-start")} onClick={() => onSelect(new Set(section.rows.map((r) => keyOf("r", r.id))))}>
            Edit its rows →
          </button>
        ) : null}
      </Panel>
      {section.display === "seats" && !isTable && section.rows.length ? <SectionShape doc={doc} section={section} onChange={onChange} onNotify={onNotify} /> : null}
      <Panel title="More">
        <Disclosure
          title="Label on the map"
          summary={section.label.visible ? (section.label.text || section.code) : "Hidden"}
        >
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
        </Disclosure>
        <Disclosure title="Delivery hint" summary={section.entrance || "None"}>
          <FieldRow label="Entrance" htmlFor="section-entrance" hint={<span>For runners, e.g. “Gate C, stairs 12”.</span>}>
            <TextField id="section-entrance" value={section.entrance} maxLength={40} onChange={(entrance) => set({ entrance }, "entrance")} />
          </FieldRow>
        </Disclosure>
      </Panel>
    </>
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
      <TableScale doc={doc} section={section} onChange={onChange} />
    </>
  );
}

function TableScale({ doc, section, onChange }: Pick<Props, "doc" | "onChange"> & { section: SeatMapSection }) {
  const row = section.rows[0];
  const base = useRef(section);
  if (base.current.id !== section.id) base.current = section;
  const origin = base.current.rows[0];
  if (!row || !origin || origin.boxW <= 0) return null;
  return (
    <FieldRow label="Scale" htmlFor="table-scale">
      <ScaleSlider
        id="table-scale"
        value={row.boxW / origin.boxW}
        onChange={(scale) => {
          const next = base.current;
          const grown = next.points.map(([x, y]): Point => [origin.x + (x - origin.x) * scale, origin.y + (y - origin.y) * scale]);
          onChange(
            updateSection(doc, section.id, (s) => ({
              ...s,
              points: grown,
              rows: s.rows.map((r, i) => (i === 0 ? { ...r, boxW: origin.boxW * scale, boxH: origin.boxH * scale } : r)),
            })),
            `${section.id}:scale`,
          );
        }}
      />
    </FieldRow>
  );
}

/** Commits only valid codes so a half-typed value never reaches the document. */
function printedSpan(row: SeatMapRow): string {
  const gone = new Set(row.removed);
  const nums: number[] = [];
  for (let i = 0; i < row.seats; i++) if (!gone.has(i)) nums.push(seatNumber(row, i));
  if (!nums.length) return "No seats";
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? `Seat ${lo}` : `Seats ${lo}–${hi}`;
}

function GenerateSeats({ doc, section, onChange, onSelect }: Pick<Props, "doc" | "onChange" | "onSelect"> & { section: SeatMapSection }) {
  const [rows, setRows] = useState(4);
  const [seats, setSeats] = useState(8);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    const result = fillSectionGrid(section, rows, seats, doc.numbering);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    onChange(addRows(doc, section.id, result.rows), `${section.id}:generate`);
    onSelect(new Set(result.rows.map((r) => keyOf("r", r.id))));
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 px-3 py-2.5">
      <p className="text-[12px] leading-snug text-neutral-500">Fill this section with even rows, from the top-left corner to the bottom-right.</p>
      <FieldRow label="Rows" htmlFor="gen-rows">
        <NumberField id="gen-rows" value={rows} min={1} max={MAX_ROWS_PER_SECTION} digits={0} onChange={(n) => setRows(Math.max(1, Math.round(n)))} />
      </FieldRow>
      <FieldRow label="Seats per row" htmlFor="gen-seats">
        <NumberField id="gen-seats" value={seats} min={1} max={MAX_SEATS_PER_ROW} digits={0} onChange={(n) => setSeats(Math.max(1, Math.round(n)))} />
      </FieldRow>
      {error ? <p className="text-[12px] leading-snug text-red-600">{error}</p> : null}
      <button type="button" onClick={generate} className="h-8 rounded-lg bg-neutral-900 px-3 text-[13px] font-medium text-white hover:bg-neutral-800">
        Generate seats
      </button>
    </div>
  );
}

/** Picked chairs, with every live chair of a wholly selected row added in. */
function pickedSeats(doc: SeatMapDoc, selection: Selection): { picks: SeatPick[]; rows: SeatMapRow[] } {
  const parts = splitSelection(selection);
  const picks: SeatPick[] = [];
  const seen = new Set<string>();
  const add = (row: SeatMapRow, index: number) => {
    const key = `${row.id}:${index}`;
    if (index >= row.seats || row.removed.includes(index) || seen.has(key)) return;
    seen.add(key);
    picks.push({ rowId: row.id, index });
  };
  const rows = new Map<string, SeatMapRow>();
  for (const s of parts.seats) {
    const row = findRow(doc, s.rowId)?.row;
    if (!row) continue;
    rows.set(row.id, row);
    add(row, s.index);
  }
  for (const id of parts.rows) {
    const row = findRow(doc, id)?.row;
    if (!row) continue;
    rows.set(row.id, row);
    for (let i = 0; i < row.seats; i++) add(row, i);
  }
  return { picks, rows: [...rows.values()] };
}

function SeatsPanel({ doc, selection, onChange }: Props) {
  const { picks, rows } = pickedSeats(doc, selection);
  const ids = new Set(rows.map((r) => r.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const numbers = picks.map((p) => seatNumber(byId.get(p.rowId)!, p.index));
  const wheelchair = picks.length > 0 && picks.every((p, i) => byId.get(p.rowId)!.wheelchair.includes(numbers[i]));
  const n = picks.length;
  return (
    <>
      <Heading kind="Seats" title={n === 1 ? `Seat ${numbers[0]}` : `${n.toLocaleString("en")} seats`} subtitle={rows.length === 1 ? `Row ${rows[0].label}` : `${rows.length} rows`} />
      <Panel title="">
        <FieldRow label="Wheelchair seat" htmlFor="seat-wheelchair" hint="Shows a wheelchair icon above the seat number.">
          <Switch id="seat-wheelchair" checked={wheelchair} disabled={!n} onCheckedChange={(on) => onChange(setWheelchair(doc, picks, on), "seats:wheelchair")} />
        </FieldRow>
        <p className="text-[12px] leading-snug text-neutral-500">Delete leaves that number unused and keeps the gap. Renumber makes the remaining seats run in order, without moving them.</p>
        {rows.some(rowNeedsRenumber) ? (
          <button type="button" className={cn(linkButton, "self-start")} onClick={() => onChange(renumberRows(doc, ids), "seats:renumber")}>
            Renumber seats
          </button>
        ) : null}
      </Panel>
    </>
  );
}

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

const ALIGN = [
  { mode: "start", label: "Align row starts", Icon: TextAlignStart },
  { mode: "center", label: "Centre rows", Icon: TextAlignCenter },
  { mode: "end", label: "Align row ends", Icon: TextAlignEnd },
] as const;

function AlignButtons({ onAlign }: { onAlign: (mode: "start" | "center" | "end") => void }) {
  return (
    <div className="flex h-8 rounded-lg border border-neutral-200 bg-white p-0.5">
      {ALIGN.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => onAlign(mode)}
          className="grid flex-1 place-items-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}

const PADDING_SIDES = [
  { index: 0, label: "Front" },
  { index: 2, label: "Back" },
  { index: 3, label: "Start" },
  { index: 1, label: "End" },
] as const;

function padWorld(meters: number) {
  return Math.round(Math.min(20, Math.max(0, meters)) * 100) / 10;
}

/** One value for every side, or each side on its own — the same switch as Figma's corner radius. */
function PaddingField({ id, padding, onChange }: { id: string; padding: SeatMapSection["padding"]; onChange: (padding: SeatMapSection["padding"]) => void }) {
  const uniform = padding.every((p) => p === padding[0]);
  const [individual, setIndividual] = useState(!uniform);
  const showSides = individual || !uniform;
  return (
    <div className="flex items-start gap-1.5">
      <div className="min-w-0 flex-1">
        {showSides ? (
          <div className="grid grid-cols-2 gap-1.5">
            {PADDING_SIDES.map(({ index, label }) => (
              <label key={index} className="flex flex-col gap-0.5">
                <span className="text-[11px] text-neutral-500">{label}</span>
                <NumberField
                  id={`${id}-${index}`}
                  value={padding[index] / 10}
                  suffix="m"
                  step={0.1}
                  min={0}
                  max={20}
                  onChange={(meters) => {
                    const next = [...padding] as SeatMapSection["padding"];
                    next[index] = padWorld(meters);
                    onChange(next);
                  }}
                />
              </label>
            ))}
          </div>
        ) : (
          <NumberField
            id={id}
            value={padding[0] / 10}
            suffix="m"
            step={0.1}
            min={0}
            max={20}
            onChange={(meters) => {
              const v = padWorld(meters);
              onChange([v, v, v, v]);
            }}
          />
        )}
      </div>
      <button
        type="button"
        aria-pressed={showSides}
        aria-label={showSides ? "Same padding on every side" : "Edit each side"}
        title={showSides ? "Same padding on every side" : "Edit each side"}
        onClick={() => {
          if (showSides) {
            if (!uniform) {
              const v = padding[0];
              onChange([v, v, v, v]);
            }
            setIndividual(false);
          } else setIndividual(true);
        }}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-blue-500",
          showSides ? "border-blue-500 bg-blue-50 text-blue-600" : "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800",
        )}
      >
        <PaddingSidesIcon separate={showSides} />
      </button>
    </div>
  );
}

function PaddingSidesIcon({ separate }: { separate: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      {separate ? (
        <>
          <path d="M3.5 6V4.8A1.3 1.3 0 0 1 4.8 3.5H6" />
          <path d="M10 3.5h1.2A1.3 1.3 0 0 1 12.5 4.8V6" />
          <path d="M12.5 10v1.2a1.3 1.3 0 0 1-1.3 1.3H10" />
          <path d="M6 12.5H4.8A1.3 1.3 0 0 1 3.5 11.2V10" />
        </>
      ) : (
        <rect x="3.25" y="3.25" width="9.5" height="9.5" rx="1.5" />
      )}
    </svg>
  );
}

/** How the block sits: its bend, whether it follows the venue shape, and the outline around it. */
function SectionShape({ doc, section, onChange, onNotify }: Pick<Props, "doc" | "onChange" | "onNotify"> & { section: SeatMapSection }) {
  const set = (patch: Partial<SeatMapSection>, field: string) => onChange(updateSection(doc, section.id, (s) => ({ ...s, ...patch })), `${section.id}:${field}`);
  const hasVenue = venuesOf(doc).length > 0;
  const rowIds = new Set(section.rows.map((r) => r.id));
  const lines = section.rows.filter((r) => r.layout === "line").length;
  return (
    <Panel title="Shape">
      <FieldRow label="Curve" htmlFor="section-bend" hint={section.follow !== "off" ? "Off while the block follows the venue shape." : "Negative bends the other way."}>
        <SliderField id="section-bend" label="Curve" value={section.bend} suffix="°" min={-360} max={360} digits={0} onChange={(bend) => set({ bend }, "bend")} />
      </FieldRow>
      <FieldRow layout="stack" label="Venue shape" htmlFor="section-follow" hint={hasVenue ? "Rows wrap around the nearest venue shape, held at the middle of the block. Padding keeps the section off it." : "Draw a venue shape first (Shapes in the tool rail)."}>
        <Segmented
          id="section-follow"
          size="sm"
          value={!hasVenue || section.follow === "off" ? "off" : "on"}
          onChange={(follow) => {
            if (!hasVenue || follow === section.follow) return;
            if (follow === "off") onChange(updateSection(doc, section.id, (s) => detachVenueFollow(s, venuesOf(doc))), `${section.id}:follow`);
            else set({ follow: "on", face: "auto" }, "follow");
          }}
          options={[
            { value: "off", label: "Off" },
            { value: "on", label: "On" },
          ]}
        />
      </FieldRow>
      {lines > 1 ? (
        <FieldRow label="Align rows">
          <AlignButtons
            onAlign={(mode) => {
              const next = alignSelectedRows(doc, rowIds, mode);
              if (next.sections.every((s, i) => s.rows === doc.sections[i].rows)) onNotify("Those rows already line up.");
              else onChange(next, `${section.id}:align`);
            }}
          />
        </FieldRow>
      ) : null}
      <FieldRow layout="stack" label="Outline" htmlFor="section-outline" hint={section.outline === "auto" ? "Follows the seats. Dragging a corner switches back to drawn." : undefined}>
        <Segmented
          id="section-outline"
          size="sm"
          value={section.outline}
          onChange={(outline) => set({ outline }, "outline")}
          options={[
            { value: "drawn", label: "Drawn" },
            { value: "auto", label: "Follow seats" },
          ]}
        />
      </FieldRow>
      {section.outline === "auto" ? (
        <FieldRow layout="stack" label="Padding" htmlFor="section-pad" hint="Space between the seats and the outline. The side facing a venue shape stays that far off it.">
          <PaddingField key={section.id} id="section-pad" padding={section.padding} onChange={(padding) => set({ padding }, "pad")} />
        </FieldRow>
      ) : null}
    </Panel>
  );
}

function RowsPanel({ doc, ids, issues, onChange, onSelect, onNotify }: Props & { ids: ReadonlySet<string> }) {
  const found = [...ids].map((id) => findRow(doc, id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (!found.length) return null;
  const rows = found.map((f) => f.row);
  const single = rows.length === 1 ? rows[0] : null;
  const sections = [...new Map(found.map((f) => [f.section.id, f.section])).values()];
  const key = [...ids].sort().join(",").slice(0, 80);
  const patch = (fn: (r: SeatMapRow, i: number) => SeatMapRow, field: string) => onChange(updateRows(doc, ids, fn), `${key}:${field}`);
  const seats = rows.reduce((n, r) => n + liveSeatCount(r), 0);
  const removed = rows.reduce((n, r) => n + r.seats - liveSeatCount(r), 0);
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
    const { step, style } = doc.numbering.rows;
    patch((r) => ({ ...r, label: stepLabel(start.trim(), (index.get(r.id) ?? 0) * step, style) || r.label }), "labels");
  }

  const allLines = rows.every((r) => r.layout === "line");
  const allRings = rows.every((r) => r.layout === "ring");
  // Several rows of one block curve together, through the section's bend.
  const block = !single && sections.length === 1 && sections[0].display === "seats" ? sections[0] : null;
  const loose = sections.every((s) => s.loose);
  const where = sections[0] && !sections[0].loose ? `Section ${sections[0].code}` : "Unassigned";
  const subtitle = single
    ? `${liveSeatCount(single)} seat${liveSeatCount(single) === 1 ? "" : "s"} · ${where}`
    : `${seats.toLocaleString("en")} seats${sections.length === 1 ? (sections[0].loose ? " · unassigned" : ` · Section ${sections[0].code}`) : ""}`;

  return (
    <>
      <Heading kind={loose ? "Unassigned seats" : "Rows"} title={single ? `Row ${single.label}` : `${rows.length} rows`} subtitle={subtitle} />
      <Issues issues={mine} />
      <Panel
        title=""
        action={
          sections.length === 1 && !sections[0].loose ? (
            <button type="button" className={linkButton} onClick={() => onSelect(new Set([keyOf("s", sections[0].id)]))}>
              Open section
            </button>
          ) : null
        }
      >
        {loose ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-800">
            Not in a section yet. Press <kbd className="rounded border border-amber-200 bg-white px-1 text-[10px] font-semibold">G</kbd> or use the floating bar to group them.
          </p>
        ) : null}
        {single ? (
          <FieldRow label="Label" htmlFor="row-label">
            <TextField id="row-label" value={single.label} maxLength={8} accept={(v) => Boolean(v.trim())} onChange={(label) => patch((r) => ({ ...r, label: label.trim() }), "label")} />
          </FieldRow>
        ) : (
          <FieldRow label="Label from" htmlFor="row-labels" hint="Front to back: 1, 2, 3… or A, B, C…">
            <TextField id="row-labels" value={ordered[0].label} maxLength={8} accept={(v) => Boolean(v.trim())} onChange={relabel} />
          </FieldRow>
        )}
        <FieldRow label={allLines ? "Seats" : "Chairs"} htmlFor="row-seats" hint={removed ? `${removed} removed` : !single ? `${seats.toLocaleString("en")} in total` : undefined}>
          <NumberField id="row-seats" value={common(rows.map((r) => r.seats))} min={1} max={MAX_SEATS_PER_ROW} digits={0} onChange={(n) => patch((r) => applySeatCount(r, n, r.spread), "seats")} />
        </FieldRow>
        {allLines ? (
          <FieldRow label="Spacing" htmlFor="row-spread">
            <Segmented
              id="row-spread"
              value={common(rows.map((r) => r.spread)) as RowPlan["spread"] | null}
              onChange={(v) => patch((r) => applySeatCount(r, r.seats, v), "spread")}
              options={[
                { value: "packed", label: "Normal" },
                { value: "edge", label: "Edge to edge" },
              ]}
            />
          </FieldRow>
        ) : null}
        <FieldRow label="Rotation" htmlFor="row-rotation">
          <NumberField id="row-rotation" value={common(rows.map((r) => r.rotation))} suffix="°" step={1} onChange={(n) => patch((r) => ({ ...r, rotation: n }), "rotation")} />
        </FieldRow>

        <Disclosure title="Row geometry" summary={allLines ? "Curve, spacing" : "Open spaces"} defaultOpen={allLines}>
          {allLines ? (
            <>
              {block ? (
                <FieldRow label="Curve" htmlFor="row-curve" hint="Bends the whole block around one centre, so rows never overlap.">
                  <SliderField
                    id="row-curve"
                    label="Curve"
                    value={block.bend}
                    suffix="°"
                    min={-360}
                    max={360}
                    digits={0}
                    onChange={(bend) => onChange(updateSection(doc, block.id, (s) => ({ ...s, bend })), `${block.id}:bend`)}
                  />
                </FieldRow>
              ) : (
                <FieldRow label="Curve" htmlFor="row-curve">
                  <SliderField id="row-curve" label="Curve" value={common(rows.map((r) => r.curve))} suffix="°" min={-270} max={270} digits={0} onChange={(n) => patch((r) => ({ ...r, curve: n }), "curve")} />
                </FieldRow>
              )}
              <FieldRow label="Seat spacing" htmlFor="row-pitch">
                <SliderField
                  id="row-pitch"
                  label="Seat spacing"
                  value={common(rows.map((r) => r.pitch / 10))}
                  suffix="m"
                  step={0.01}
                  min={(SEAT_RADIUS * 2) / 10}
                  max={2}
                  onChange={(n) => patch((r) => ({ ...r, pitch: n * 10 }), "pitch")}
                />
              </FieldRow>
              {!single ? (
                <FieldRow label="Row spacing" htmlFor="row-spacing">
                  <SliderField id="row-spacing" label="Row spacing" value={spacing === null ? null : spacing / 10} suffix="m" step={0.01} min={0.3} max={3} onChange={setSpacing} />
                </FieldRow>
              ) : null}
              {!single ? (
                <FieldRow label="Align rows">
                  <AlignButtons
                    onAlign={(mode) => {
                      const next = alignSelectedRows(doc, ids, mode);
                      if (next.sections.every((s, i) => s.rows === doc.sections[i].rows)) onNotify("Those rows already line up.");
                      else onChange(next, `${key}:align`);
                    }}
                  />
                </FieldRow>
              ) : null}
            </>
          ) : null}
          {allRings ? (
            <FieldRow label="Open spaces" htmlFor="row-open" hint="Empty places between the chairs.">
              <NumberField id="row-open" value={common(rows.map((r) => r.gaps.length))} min={0} max={12} digits={0} onChange={(n) => patch((r) => ({ ...r, gaps: Array.from({ length: Math.round(n) }, () => 0) }), "open")} />
            </FieldRow>
          ) : null}
        </Disclosure>

        <Disclosure
          title="Seat numbering"
          summary={numberingSummary(rows)}
        >
          <FieldRow label="Start at" htmlFor="row-start">
            <NumberField id="row-start" value={common(rows.map((r) => r.start))} min={0} max={9999} digits={0} onChange={(n) => patch((r) => ({ ...r, start: Math.round(n), numbers: [] }), "start")} />
          </FieldRow>
          <FieldRow label="Step" htmlFor="row-step" hint="2 gives odd or even numbers.">
            <NumberField id="row-step" value={common(rows.map((r) => r.step))} min={1} max={99} digits={0} onChange={(n) => patch((r) => ({ ...r, step: Math.round(n), numbers: [] }), "step")} />
          </FieldRow>
          <FieldRow label="Right to left" htmlFor="row-reverse">
            <Switch id="row-reverse" checked={common(rows.map((r) => r.reverse)) ?? false} onCheckedChange={(reverse) => patch((r) => ({ ...r, reverse, numbers: [] }), "reverse")} />
          </FieldRow>
          {allLines ? (
            <FieldRow label="Aisle after" htmlFor="row-gaps" hint="Seat numbers followed by a gap, e.g. 8, 16.">
              <GapsField rows={rows} onChange={(gaps) => patch((r) => ({ ...r, gaps }), "gaps")} />
            </FieldRow>
          ) : null}
          <FieldRow label="Wheelchair" htmlFor="row-wheel" hint="Seat numbers that show a wheelchair icon, e.g. 1, 4.">
            <WheelchairField rows={rows} onChange={(wheelchair) => patch((r) => ({ ...r, wheelchair }), "wheelchair")} />
          </FieldRow>
          {single ? (
            <p className="text-[12px] text-neutral-500 tabular-nums">
              {printedSpan(single)} · {(rowLength(single) / 10).toFixed(1)} m long
            </p>
          ) : null}
          {rows.some(rowNeedsRenumber) ? (
            <button type="button" className={cn(linkButton, "self-start")} onClick={() => onChange(renumberRows(doc, ids), `${key}:renumber`)}>
              Renumber seats
            </button>
          ) : null}
        </Disclosure>
      </Panel>
    </>
  );
}

function numberingSummary(rows: SeatMapRow[]): string {
  const start = rows.every((r) => r.start === rows[0].start) ? rows[0].start : null;
  const reverse = rows.every((r) => r.reverse === rows[0].reverse) ? rows[0].reverse : null;
  const bits: string[] = [];
  if (start !== null) bits.push(`starts at ${start}`);
  if (reverse) bits.push("right→left");
  const anyWheel = rows.some((r) => r.wheelchair.length);
  if (anyWheel) bits.push("wheelchair");
  return bits.length ? bits.join(" · ") : "Default";
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
        const wheelchair = [...new Set(text.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n >= 0))].slice(0, MAX_SEATS_PER_ROW).sort((a, b) => a - b);
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

function VenueShapePanel({ doc, id, onChange, onDelete }: Props & { id: string }) {
  const d = doc.decorations.find((x) => x.id === id);
  if (!d) return null;
  const set = (patch: Partial<typeof d>, field: string) => onChange(updateDecoration(doc, id, patch), `${id}:${field}`);
  const followers = doc.sections.filter((s) => s.follow !== "off").length;
  const maxRadius = Math.min(d.w, d.h) / 20;
  return (
    <>
      <Heading kind="Shape" title="Venue shape" subtitle={`${(d.w / 10).toLocaleString("en")} × ${(d.h / 10).toLocaleString("en")} m`} />
      <Panel title="">
        <p className="text-[12px] leading-snug text-neutral-500">
          {followers ? `${followers} section${followers === 1 ? "" : "s"} follow this shape.` : "Open a section and turn Venue shape on to wrap its rows around this shape."}
        </p>
        <FieldRow label="Position X" htmlFor="venue-x">
          <NumberField id="venue-x" value={d.x / 10} suffix="m" step={0.5} onChange={(n) => set({ x: n * 10 }, "x")} />
        </FieldRow>
        <FieldRow label="Position Y" htmlFor="venue-y">
          <NumberField id="venue-y" value={d.y / 10} suffix="m" step={0.5} onChange={(n) => set({ y: n * 10 }, "y")} />
        </FieldRow>
        <FieldRow label="Width" htmlFor="venue-w">
          <NumberField id="venue-w" value={d.w / 10} suffix="m" step={0.5} min={1} onChange={(n) => set({ w: n * 10, radius: Math.min(d.radius, n * 5) }, "w")} />
        </FieldRow>
        <FieldRow label="Height" htmlFor="venue-h">
          <NumberField id="venue-h" value={d.h / 10} suffix="m" step={0.5} min={1} onChange={(n) => set({ h: n * 10, radius: Math.min(d.radius, n * 5) }, "h")} />
        </FieldRow>
        <FieldRow label="Corner radius" htmlFor="venue-radius">
          <SliderField id="venue-radius" label="Corner radius" value={Math.min(d.radius / 10, maxRadius)} suffix="m" step={0.5} min={0} max={Math.max(0.5, maxRadius)} digits={1} onChange={(n) => set({ radius: n * 10 }, "radius")} />
        </FieldRow>
        <FieldRow label="Rotation" htmlFor="venue-rotation">
          <NumberField id="venue-rotation" value={d.rotation} suffix="°" step={5} onChange={(n) => set({ rotation: n }, "rotation")} />
        </FieldRow>
        <FieldRow label="Colour" htmlFor="venue-color">
          <ColorField id="venue-color" value={d.color} onChange={(color) => set({ color }, "color")} />
        </FieldRow>
        <button type="button" onClick={onDelete} className={cn(smallButton, "self-start text-red-600")}>
          <Trash2 className="size-3.5" aria-hidden />
          Delete shape
        </button>
      </Panel>
    </>
  );
}

function DecorationPanel(props: Props & { id: string }) {
  const { doc, id, onChange } = props;
  const d = doc.decorations.find((x) => x.id === id);
  const base = useRef({ w: d?.w ?? 1, h: d?.h ?? 1 });
  if (!d) return null;
  if (d.kind === "venue") return <VenueShapePanel {...props} />;
  const set = (patch: Partial<typeof d>, field: string) => onChange(updateDecoration(doc, id, patch), `${id}:${field}`);
  const text = d.kind === "text";
  const plain = d.kind === "wall" || d.kind === "column";
  return (
    <>
      <Heading
        kind="Shape"
        title={DECORATION_NAMES[d.kind]}
        subtitle={plain ? `${(d.w / 10).toFixed(1)} × ${(d.h / 10).toFixed(1)} m` : d.label || "No label"}
      />
      <Panel title="">
        {d.kind !== "field" && !plain ? (
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
        <FieldRow label="Scale" htmlFor="deco-scale">
          <ScaleSlider
            id="deco-scale"
            value={(text ? d.h : d.w) / (text ? base.current.h : base.current.w || 1)}
            onChange={(scale) =>
              text
                ? set({ h: Math.max(2, base.current.h * scale) }, "scale")
                : set({ w: Math.max(2, base.current.w * scale), h: Math.max(2, base.current.h * scale) }, "scale")
            }
          />
        </FieldRow>
        <FieldRow label="Rotation" htmlFor="deco-rotation">
          <NumberField id="deco-rotation" value={d.rotation} suffix="°" step={5} onChange={(n) => set({ rotation: n }, "rotation")} />
        </FieldRow>
        {d.kind !== "stage" && !plain ? (
          <FieldRow label="Colour" htmlFor="deco-color">
            <ColorField id="deco-color" value={d.color} onChange={(color) => set({ color }, "color")} />
          </FieldRow>
        ) : null}
      </Panel>
    </>
  );
}

function PoiPanel({ doc, id, onChange }: Props & { id: string }) {
  const p = doc.pois.find((x) => x.id === id);
  const base = useRef({ w: p?.w || 1, h: p?.h || 1, kind: p?.kind });
  if (p && (base.current.kind !== p.kind || base.current.w <= 0)) base.current = { w: p.w || 1, h: p.h || 1, kind: p.kind };
  if (!p) return null;
  const shaped = p.kind === "stairs" || p.kind === "entrance" || p.kind === "exit";
  const kindName = p.kind === "stairs" ? "Stairs" : p.kind === "entrance" || p.kind === "exit" ? "Entrance" : "Point";
  return (
    <>
      <Heading kind="Point of interest" title={p.label || kindName} subtitle={kindName} />
      <Panel title="">
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
            {p.w > 0 && p.h > 0 ? (
              <FieldRow label="Scale" htmlFor="poi-scale">
                <ScaleSlider
                  id="poi-scale"
                  value={p.w / (base.current.w || 1)}
                  onChange={(scale) => onChange(updatePoi(doc, id, { w: Math.max(4, base.current.w * scale), h: Math.max(4, base.current.h * scale) }), `${id}:scale`)}
                />
              </FieldRow>
            ) : null}
          </>
        ) : (
          <p className="text-[12px] leading-snug text-neutral-500">Kitchens and pickup points are stops a future runner-direction map routes between.</p>
        )}
      </Panel>
    </>
  );
}
