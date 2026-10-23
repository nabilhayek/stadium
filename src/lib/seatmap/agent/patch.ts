import type { SeatMapDoc, SeatMapSection } from "../schema";

/**
 * One change from the assistant. Sections are sent only when they changed; the
 * small arrays travel whole. `order` lists every section id after the change.
 */
export type SeatMapPatch = {
  order: string[];
  put: SeatMapSection[];
  categories: SeatMapDoc["categories"];
  decorations: SeatMapDoc["decorations"];
  pois: SeatMapDoc["pois"];
  numbering: SeatMapDoc["numbering"];
};

export function diffDoc(prev: SeatMapDoc, next: SeatMapDoc): SeatMapPatch {
  const before = new Map(prev.sections.map((s) => [s.id, s]));
  return {
    order: next.sections.map((s) => s.id),
    put: next.sections.filter((s) => before.get(s.id) !== s),
    categories: next.categories,
    decorations: next.decorations,
    pois: next.pois,
    numbering: next.numbering,
  };
}

/** Null when the patch refers to a section the base does not have. */
export function applyPatch(base: SeatMapDoc, patch: SeatMapPatch): SeatMapDoc | null {
  const known = new Map(base.sections.map((s) => [s.id, s]));
  for (const s of patch.put) known.set(s.id, s);
  const sections: SeatMapSection[] = [];
  for (const id of patch.order) {
    const s = known.get(id);
    if (!s) return null;
    sections.push(s);
  }
  return { ...base, sections, categories: patch.categories, decorations: patch.decorations, pois: patch.pois, numbering: patch.numbering };
}
