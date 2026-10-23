import { z } from "zod";

/**
 * The seat map document. World units are decimetres (10 = 1 m), y grows down.
 * Rows store parameters, not seat positions; `geometry.ts` derives the seats.
 */

export const SEATMAP_VERSION = 1;

export const SEAT_RADIUS = 2.2;
export const DEFAULT_SEAT_PITCH = 5.5;
export const DEFAULT_ROW_PITCH = 8;

export const MAX_SECTIONS = 600;
export const MAX_ROWS_PER_SECTION = 120;
export const MAX_SEATS_PER_ROW = 300;
export const MAX_TOTAL_SEATS = 150_000;

/** Tableau 10: distinguishable for the common colour-vision deficiencies. */
export const CATEGORY_PALETTE = ["#4e79a7", "#59a14f", "#f28e2b", "#e15759", "#b07aa1", "#76b7b2", "#edc948", "#ff9da7", "#9c755f", "#bab0ac"];

const id = z.string().min(1).max(40);
const coord = z.number().finite().min(-100_000).max(100_000);
const point = z.tuple([coord, coord]);
const color = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a hex colour like #4e79a7.");

export const SECTION_CODE = /^[A-Z0-9][A-Z0-9-]{0,11}$/;

export const categorySchema = z.object({
  id,
  label: z.string().trim().min(1).max(40),
  color,
});

export const rowSchema = z.object({
  id,
  label: z.string().trim().min(1).max(8),
  seats: z.number().int().min(1).max(MAX_SEATS_PER_ROW),
  /** Midpoint of the row (on the arc when curved). */
  x: coord,
  y: coord,
  /** Degrees, direction of seat 1 → last seat. */
  rotation: z.number().finite(),
  /** Total arc angle in degrees. 0 is straight; positive bends the ends up (local -y). */
  curve: z.number().min(-270).max(270),
  /** Centre-to-centre seat distance. */
  pitch: z.number().min(SEAT_RADIUS * 2).max(60),
  /** Number printed on the first seat. */
  start: z.number().int().min(0).max(9999),
  /** Added per seat: 2 gives odd or even numbering. */
  step: z.number().int().min(1).max(99).default(1),
  /** Number seats right-to-left instead of left-to-right. */
  reverse: z.boolean(),
  /** Seat numbers followed by an empty seat-width gap (aisles). On a table, the length is how many chair spaces stay empty. */
  gaps: z.array(z.number().int()).max(40),
  /** Packed keeps the normal gap and centres the seats. Edge spreads them from one side of the row to the other. */
  spread: z.enum(["packed", "edge"]).default("packed"),
  /** Line is a row. Ring and sides are the chairs around a table. */
  layout: z.enum(["line", "ring", "sides"]).default("line"),
  /** Table size, in world units. Chairs sit just outside it. */
  boxW: z.number().min(0).max(100_000).default(0),
  boxH: z.number().min(0).max(100_000).default(0),
  /** Seat numbers that show a wheelchair icon. */
  wheelchair: z.array(z.number().int().min(0).max(9999)).max(MAX_SEATS_PER_ROW).default([]),
  /** Slot indexes left empty. The chair is gone; its number stays unused until the row is renumbered. */
  removed: z.array(z.number().int().min(0).max(MAX_SEATS_PER_ROW)).max(MAX_SEATS_PER_ROW).default([]),
  /** Printed number of each slot. Empty means start, start + 1, … along the row. */
  numbers: z.array(z.number().int().min(0).max(9999)).max(MAX_SEATS_PER_ROW).default([]),
});

export const sectionLabelSchema = z.object({
  /** Shown on the map; empty means the code. */
  text: z.string().max(24),
  size: z.number().min(4).max(400),
  dx: coord,
  dy: coord,
  rotation: z.number().finite(),
  visible: z.boolean(),
});

export const sectionSchema = z.object({
  id,
  /** Matches Section.code: QR codes, confirm-seat and delivery use it. */
  code: z.string().regex(SECTION_CODE, "Use 1–12 capital letters, digits or dashes."),
  /** Matches Section.name, e.g. "Upper Concourse 434". */
  name: z.string().trim().min(1).max(60),
  categoryId: id.nullable(),
  points: z.array(point).min(3).max(400),
  label: sectionLabelSchema,
  entrance: z.string().max(40),
  /** Seats draws every chair. Block is one labelled area, such as a loge. Tables draw a top with chairs around it. */
  display: z.enum(["seats", "block", "round-table", "rect-table"]).default("seats"),
  /** Seats drawn before they belong to a stand. The outline appears when they are grouped. */
  loose: z.boolean().default(false),
  rows: z.array(rowSchema).max(MAX_ROWS_PER_SECTION),
  /** Degrees the whole block bends around a shared centre. Positive bends around the front row. */
  bend: z.number().min(-360).max(360).default(0),
  /**
   * Rows follow the nearest venue shape, held by the middle of the block.
   * Older drafts stored start, center or end; those all read as on.
   */
  follow: z
    .enum(["off", "on", "start", "center", "end"])
    .default("off")
    .transform((value): "off" | "on" => (value === "off" ? "off" : "on")),
  /**
   * Which edge faces the venue while the rows follow it. Auto chooses the edge
   * already on the rim. A drag keeps that choice, so letting go on a corner
   * cannot flip the block onto the other side.
   */
  face: z.enum(["front", "back", "auto"]).default("auto"),
  /** Drawn keeps the corners as placed. Auto wraps the seats with `padding`. New sections follow the seats. */
  outline: z.enum(["drawn", "auto"]).default("auto"),
  /** Front, end, back and start of the block, in world units. */
  padding: z.tuple([z.number().min(0).max(200), z.number().min(0).max(200), z.number().min(0).max(200), z.number().min(0).max(200)]).default([3, 3, 3, 3]),
});

export const DECORATION_KINDS = ["stage", "field", "rect", "ellipse", "wall", "column", "venue", "text"] as const;
export type DecorationKind = (typeof DECORATION_KINDS)[number];

export const decorationSchema = z.object({
  id,
  kind: z.enum(DECORATION_KINDS),
  /** Centre. */
  x: coord,
  y: coord,
  w: z.number().min(1).max(100_000),
  h: z.number().min(1).max(100_000),
  rotation: z.number().finite(),
  label: z.string().max(60),
  color,
  /** Corner radius of a venue shape. */
  radius: z.number().min(0).max(100_000).default(0),
});

export const POI_KINDS = ["kitchen", "entrance", "exit", "stairs", "pickup"] as const;
export type PoiKind = (typeof POI_KINDS)[number];

export const poiSchema = z.object({
  id,
  kind: z.enum(POI_KINDS),
  x: coord,
  y: coord,
  label: z.string().max(40),
  /** World size. 0 keeps the old screen-sized dot (kitchens and pickup points). */
  w: z.number().min(0).max(100_000).default(0),
  h: z.number().min(0).max(100_000).default(0),
  /** Degrees. 0 points up the map (toward decreasing y). */
  rotation: z.number().finite().default(0),
});

export const ROW_LABEL_STYLES = ["numbers", "roman", "letters"] as const;
export type RowLabelStyle = (typeof ROW_LABEL_STYLES)[number];

/** How new rows and seats are labelled. Existing rows keep their own numbering. */
export const numberingSchema = z.object({
  rows: z.object({
    style: z.enum(ROW_LABEL_STYLES).default("numbers"),
    from: z.number().int().min(0).max(999).default(1),
    step: z.number().int().min(1).max(99).default(1),
    /** Label from the back row toward the front. */
    reverse: z.boolean().default(false),
  }),
  seats: z.object({
    from: z.number().int().min(0).max(9999).default(1),
    step: z.number().int().min(1).max(99).default(1),
    reverse: z.boolean().default(false),
  }),
});

export const DEFAULT_NUMBERING: z.infer<typeof numberingSchema> = {
  rows: { style: "numbers", from: 1, step: 1, reverse: false },
  seats: { from: 1, step: 1, reverse: false },
};

export const seatMapSchema = z.object({
  version: z.literal(SEATMAP_VERSION),
  categories: z.array(categorySchema).max(20),
  sections: z.array(sectionSchema).max(MAX_SECTIONS),
  decorations: z.array(decorationSchema).max(500),
  pois: z.array(poiSchema).max(500),
  numbering: numberingSchema.default(DEFAULT_NUMBERING),
});

export type SeatMapCategory = z.infer<typeof categorySchema>;
export type SeatMapRow = z.infer<typeof rowSchema>;
export type SeatMapSection = z.infer<typeof sectionSchema>;
export type SeatMapDecoration = z.infer<typeof decorationSchema>;
export type SeatMapPoi = z.infer<typeof poiSchema>;
export type SeatMapDoc = z.infer<typeof seatMapSchema>;
export type SeatMapNumbering = z.infer<typeof numberingSchema>;

export function emptySeatMap(): SeatMapDoc {
  return {
    version: SEATMAP_VERSION,
    categories: [
      { id: "lower", label: "Lower tier", color: CATEGORY_PALETTE[3] },
      { id: "middle", label: "Middle tier", color: CATEGORY_PALETTE[2] },
      { id: "upper", label: "Upper tier", color: CATEGORY_PALETTE[0] },
    ],
    sections: [],
    decorations: [],
    pois: [],
    numbering: DEFAULT_NUMBERING,
  };
}

/** Stored JSON from before a schema change, or hand-edited rows, fall back to an empty map. */
export function parseSeatMap(value: unknown): SeatMapDoc | null {
  const parsed = seatMapSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function newId(prefix = ""): string {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}
