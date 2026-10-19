import {
  boundsOf,
  boxCorners,
  moveDecoration,
  movePoi,
  moveRow,
  moveSection,
  nextSectionCode,
  stepLabel,
  translation,
  unionBounds,
  type Bounds,
  type Point,
  type Rigid,
} from "@/lib/seatmap/geometry";
import { decorationWidth, type Scene } from "@/lib/seatmap/engine/scene";
import { newId, type SeatMapDecoration, type SeatMapDoc, type SeatMapPoi, type SeatMapRow, type SeatMapSection } from "@/lib/seatmap/schema";

/** Selection keys: `s:` section, `r:` row, `d:` decoration, `p:` point of interest. */
export type SelKey = `${"s" | "r" | "d" | "p"}:${string}`;
export type Selection = ReadonlySet<string>;

export const keyOf = (kind: "s" | "r" | "d" | "p", id: string) => `${kind}:${id}` as SelKey;

export function splitSelection(sel: Selection) {
  const sections = new Set<string>();
  const rows = new Set<string>();
  const decorations = new Set<string>();
  const pois = new Set<string>();
  for (const key of sel) {
    const id = key.slice(2);
    if (key.startsWith("s:")) sections.add(id);
    else if (key.startsWith("r:")) rows.add(id);
    else if (key.startsWith("d:")) decorations.add(id);
    else if (key.startsWith("p:")) pois.add(id);
  }
  return { sections, rows, decorations, pois };
}

/** Scene indices for the engine's drag preview. Rows inside a selected section move with it. */
export function transientOf(scene: Scene, sel: Selection) {
  const parts = splitSelection(sel);
  const sections = new Set<number>();
  for (const id of parts.sections) {
    const i = scene.sectionIndex.get(id);
    if (i !== undefined) sections.add(i);
  }
  const rows = new Set<number>();
  for (const id of parts.rows) {
    const i = scene.rowIndex.get(id);
    if (i !== undefined && !sections.has(scene.rows[i].section)) rows.add(i);
  }
  return { sections, rows, decorations: parts.decorations, pois: parts.pois };
}

export function transformSelection(doc: SeatMapDoc, sel: Selection, t: Rigid): SeatMapDoc {
  const parts = splitSelection(sel);
  return {
    ...doc,
    sections: doc.sections.map((s) => {
      if (parts.sections.has(s.id)) return moveSection(s, t);
      if (!s.rows.some((r) => parts.rows.has(r.id))) return s;
      return { ...s, rows: s.rows.map((r) => (parts.rows.has(r.id) ? moveRow(r, t) : r)) };
    }),
    decorations: doc.decorations.map((d) => (parts.decorations.has(d.id) ? moveDecoration(d, t) : d)),
    pois: doc.pois.map((p) => (parts.pois.has(p.id) ? movePoi(p, t) : p)),
  };
}

export function deleteSelection(doc: SeatMapDoc, sel: Selection): SeatMapDoc {
  const parts = splitSelection(sel);
  return {
    ...doc,
    sections: doc.sections
      .filter((s) => !parts.sections.has(s.id))
      .map((s) => (s.rows.some((r) => parts.rows.has(r.id)) ? { ...s, rows: s.rows.filter((r) => !parts.rows.has(r.id)) } : s)),
    decorations: doc.decorations.filter((d) => !parts.decorations.has(d.id)),
    pois: doc.pois.filter((p) => !parts.pois.has(p.id)),
  };
}

/** Copies sit 2 m down-right. Sections get fresh codes; rows get the next free labels. */
export function duplicateSelection(doc: SeatMapDoc, sel: Selection): { doc: SeatMapDoc; selection: Set<string> } {
  const parts = splitSelection(sel);
  const shift = translation(20, 20);
  const next = new Set<string>();
  let out: SeatMapDoc = doc;

  for (const s of doc.sections) {
    if (!parts.sections.has(s.id)) continue;
    const code = nextSectionCode(out);
    const copy = moveSection({ ...s, id: newId("s"), code, name: s.name.replace(s.code, code), rows: s.rows.map((r) => ({ ...r, id: newId("r") })) }, shift);
    out = { ...out, sections: [...out.sections, copy] };
    next.add(keyOf("s", copy.id));
  }

  out = {
    ...out,
    sections: out.sections.map((s) => {
      const picked = s.rows.filter((r) => parts.rows.has(r.id) && !parts.sections.has(s.id));
      if (!picked.length) return s;
      const taken = new Set(s.rows.map((r) => r.label));
      let label = s.rows[s.rows.length - 1]?.label ?? "1";
      const copies = picked.map((r) => {
        do label = stepLabel(label, 1);
        while (taken.has(label));
        taken.add(label);
        const copy = moveRow({ ...r, id: newId("r"), label }, translation(0, 8));
        next.add(keyOf("r", copy.id));
        return copy;
      });
      return { ...s, rows: [...s.rows, ...copies] };
    }),
  };

  const decorations = doc.decorations.filter((d) => parts.decorations.has(d.id)).map((d) => moveDecoration({ ...d, id: newId("d") }, shift));
  const pois = doc.pois.filter((p) => parts.pois.has(p.id)).map((p) => movePoi({ ...p, id: newId("p") }, shift));
  for (const d of decorations) next.add(keyOf("d", d.id));
  for (const p of pois) next.add(keyOf("p", p.id));
  return { doc: { ...out, decorations: [...out.decorations, ...decorations], pois: [...out.pois, ...pois] }, selection: next };
}

export function selectionBounds(scene: Scene, sel: Selection): Bounds | null {
  let b: Bounds | null = null;
  for (const key of sel) {
    const id = key.slice(2);
    if (key.startsWith("s:")) {
      const i = scene.sectionIndex.get(id);
      if (i !== undefined) b = unionBounds(b, scene.sections[i].bounds);
    } else if (key.startsWith("r:")) {
      const i = scene.rowIndex.get(id);
      if (i !== undefined) b = unionBounds(b, scene.rows[i].bounds);
    } else if (key.startsWith("d:")) {
      const d = scene.decorations.find((x) => x.id === id);
      if (d) b = unionBounds(b, boundsOf(boxCorners(d.x, d.y, decorationWidth(d), d.h, d.rotation)));
    } else if (key.startsWith("p:")) {
      const p = scene.pois.find((x) => x.id === id);
      if (p) {
        b = unionBounds(
          b,
          p.w > 0 && p.h > 0
            ? boundsOf(boxCorners(p.x, p.y, p.w, p.h, p.rotation))
            : { minX: p.x - 6, minY: p.y - 6, maxX: p.x + 6, maxY: p.y + 6 },
        );
      }
    }
  }
  return b;
}

export function findRow(doc: SeatMapDoc, rowId: string): { section: SeatMapSection; row: SeatMapRow } | null {
  for (const section of doc.sections) {
    const row = section.rows.find((r) => r.id === rowId);
    if (row) return { section, row };
  }
  return null;
}

export function updateSection(doc: SeatMapDoc, id: string, patch: (s: SeatMapSection) => SeatMapSection): SeatMapDoc {
  return { ...doc, sections: doc.sections.map((s) => (s.id === id ? patch(s) : s)) };
}

export function updateRows(doc: SeatMapDoc, ids: ReadonlySet<string>, patch: (r: SeatMapRow, index: number) => SeatMapRow): SeatMapDoc {
  let index = 0;
  return {
    ...doc,
    sections: doc.sections.map((s) => (s.rows.some((r) => ids.has(r.id)) ? { ...s, rows: s.rows.map((r) => (ids.has(r.id) ? patch(r, index++) : r)) } : s)),
  };
}

export function updateDecoration(doc: SeatMapDoc, id: string, patch: Partial<SeatMapDecoration>): SeatMapDoc {
  return { ...doc, decorations: doc.decorations.map((d) => (d.id === id ? { ...d, ...patch } : d)) };
}

export function updatePoi(doc: SeatMapDoc, id: string, patch: Partial<SeatMapPoi>): SeatMapDoc {
  return { ...doc, pois: doc.pois.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

export function setSectionPoints(doc: SeatMapDoc, id: string, points: Point[]): SeatMapDoc {
  return updateSection(doc, id, (s) => ({ ...s, points }));
}

export function addRows(doc: SeatMapDoc, sectionId: string, rows: SeatMapRow[]): SeatMapDoc {
  return updateSection(doc, sectionId, (s) => ({ ...s, rows: [...s.rows, ...rows] }));
}
