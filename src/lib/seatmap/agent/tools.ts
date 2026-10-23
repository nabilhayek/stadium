import { tool } from "ai";
import { z } from "zod";
import {
  acceptDoc,
  addFloor,
  addPoints,
  addRing,
  addSection,
  addShape,
  addStairs,
  addStand,
  checkMap,
  clearMap,
  describeMap,
  FIELD_PRESETS,
  moveSections,
  removeItems,
  setCategory,
  setField,
  updateSections,
  type BuildResult,
  type FieldKind,
  type Target,
} from "../build";
import type { SeatMapDoc } from "../schema";
import { diffDoc, type SeatMapPatch } from "./patch";

/**
 * Tools the seat map assistant calls. Inputs are in metres; the map stores decimetres.
 * Seating is placed by where it goes on the venue shape (sides, bearings, next to or
 * behind a section) and the builders solve rows and seats, so the model never does
 * geometry. Each tool returns one short line so long builds stay cheap, and a failed
 * call explains itself instead of throwing, so the model can correct the input.
 */

const m = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 100) / 10);

const target = z
  .object({
    ring: z.number().int().min(1).max(99).optional().describe("Ring number: ring 2 holds sections 201, 202, …"),
    codes: z.array(z.string().max(16)).max(200).optional().describe('Section codes or ranges, e.g. ["201-204", "310", "N1-N4"]'),
    category: z.string().max(40).optional().describe("Category name"),
    every: z.number().int().min(1).max(50).optional().describe("Keep every n-th section of that selection (2 = every other)"),
    start: z.number().int().min(1).max(99).optional().describe("Which section `every` starts on, 1-based. Default 1"),
  })
  .describe("Which sections. Combine fields to narrow down.");

const category = z.string().max(40).optional().describe("Category name. Default: Lower/Middle/Upper tier by ring");
const name = z.string().max(40).optional().describe('Section name prefix, e.g. "East stand"');
const side = z.enum(["north", "south", "east", "west"]);
const pattern = z
  .object({
    every: z.number().int().min(1).max(50),
    start: z.number().int().min(1).max(99).optional(),
    delta: z.number().int().describe("Seats added to those sections (negative = fewer)"),
  })
  .optional()
  .describe("With seats: adjust every n-th section, e.g. every 2, start 2, delta -100 = every other section has 100 fewer. The total stays exact.");

export type SeatMapState = { doc: SeatMapDoc };
export type Publish = (patch: SeatMapPatch) => Promise<void>;

export function createSeatMapTools(state: SeatMapState, publish: Publish) {
  const apply = async (result: BuildResult): Promise<string> => {
    if (!result.ok) return `Error: ${result.error}`;
    const checked = acceptDoc(result.doc);
    if (!checked.ok) return `Error: ${checked.error}`;
    const patch = diffDoc(state.doc, checked.doc);
    state.doc = checked.doc;
    await publish(patch);
    return result.note;
  };
  const sel = (t: z.infer<typeof target>): Target => t;

  return {
    get_map: tool({
      description: "Describe the current map: field, venue shape, rings, sections, seats per category, points, issues. Use sections=true for per-section seat counts.",
      inputSchema: z.object({ sections: z.boolean().optional(), ring: z.number().int().min(1).max(99).optional() }),
      execute: async ({ sections, ring }) => describeMap(state.doc, sections ? "sections" : "summary", ring),
    }),

    clear_map: tool({
      description: "Remove every section, shape and point. Use before building a brand-new venue. Categories stay.",
      inputSchema: z.object({}),
      execute: async () => apply(clearMap(state.doc)),
    }),

    set_field: tool({
      description:
        "Set the field in the centre and the venue shape (bowl) around it that all seating follows. Call it first for a new venue. The bowl can only be reshaped while no seating stands on it.",
      inputSchema: z.object({
        kind: z.enum([...(Object.keys(FIELD_PRESETS) as FieldKind[]), "none"]),
        length_m: z.number().min(5).max(500).optional(),
        width_m: z.number().min(5).max(500).optional(),
        bowl: z.enum(["rounded", "oval", "square"]).optional().describe("Corner shape of the bowl. Default rounded"),
        apron_m: z.number().min(0).max(60).optional().describe("Space between the field and the first row. Default 7 m"),
      }),
      execute: async (i) => apply(setField(state.doc, { kind: i.kind, length: m(i.length_m), width: m(i.width_m), bowl: i.bowl, apron: m(i.apron_m) })),
    }),

    add_ring: tool({
      description:
        "Add a tier of seating all the way (or part way) round the bowl, behind what is already there. Sections get equal frontage and exact seats, spread evenly over their rows. Section 1 is centred at the top, numbering runs clockwise.",
      inputSchema: z.object({
        sections: z.number().int().min(1).max(99).optional().describe("Omit unless the user gives a number; the builder picks one"),
        seats: z.number().int().min(1).max(150000).optional().describe("Total seats in the ring"),
        section_seats: z.array(z.number().int().min(1)).max(99).optional().describe("Exact seats per section, one number per section"),
        pattern,
        rows: z.number().int().min(1).max(100).optional().describe("Fixed row count (otherwise derived from seats)"),
        arc: z.object({ from: z.number(), to: z.number() }).optional().describe("Only part of the way round: bearings in degrees clockwise from north, e.g. 120 to 240 is the south end"),
        gap_m: z.number().min(0).max(60).optional().describe("Walkway in front of this ring. Default 4.5 m behind another tier"),
        aisle_m: z.number().min(0.4).max(6).optional().describe("Aisle between sections. Default 1.4 m"),
        category,
        name,
        stairs: z.boolean().optional().describe("Also add stairs in every aisle"),
        replace_ring: z.number().int().min(1).max(99).optional().describe("Rebuild this ring in place with the new settings; outer tiers move out if it grows"),
      }),
      execute: async (i) =>
        apply(
          addRing(state.doc, {
            sections: i.sections,
            seats: i.seats,
            sectionSeats: i.section_seats,
            pattern: i.pattern,
            rows: i.rows,
            arc: i.arc,
            gap: m(i.gap_m),
            aisle: m(i.aisle_m),
            category: i.category,
            name: i.name,
            stairs: i.stairs,
            replace: i.replace_ring,
          }),
        ),
    }),

    add_stand: tool({
      description: "Add a straight grandstand along one side of the bowl (north = top), behind anything already on that side. Codes N1, N2… for north and so on.",
      inputSchema: z.object({
        side,
        sections: z.number().int().min(1).max(40).optional(),
        seats: z.number().int().min(1).max(150000).optional(),
        section_seats: z.array(z.number().int().min(1)).max(40).optional(),
        pattern,
        rows: z.number().int().min(1).max(100).optional(),
        length_m: z.number().min(5).max(500).optional().describe("Default: the whole straight side"),
        gap_m: z.number().min(0).max(60).optional(),
        aisle_m: z.number().min(0.4).max(6).optional(),
        category,
        name,
        stairs: z.boolean().optional(),
      }),
      execute: async (i) =>
        apply(
          addStand(state.doc, {
            side: i.side,
            sections: i.sections,
            seats: i.seats,
            sectionSeats: i.section_seats,
            pattern: i.pattern,
            rows: i.rows,
            length: m(i.length_m),
            gap: m(i.gap_m),
            aisle: m(i.aisle_m),
            category: i.category,
            name: i.name,
            stairs: i.stairs,
          }),
        ),
    }),

    add_section: tool({
      description:
        "Add one section on the bowl with exactly `seats` seats spread evenly over its rows. Place it with ONE of: side, bearing, next_to (same tier, beside that section) or behind (a tier further out). Rows and width are solved unless given.",
      inputSchema: z.object({
        seats: z.number().int().min(1).max(36000),
        rows: z.number().int().min(1).max(100).optional(),
        width_m: z.number().min(2).max(300).optional().describe("Frontage along the bowl"),
        side: side.optional(),
        bearing: z.number().optional().describe("Degrees clockwise from north"),
        next_to: z.string().max(16).optional().describe("Section code to sit beside"),
        direction: z.enum(["clockwise", "anticlockwise"]).optional().describe("With next_to. Default clockwise"),
        behind: z.string().max(16).optional().describe("Section code to sit behind"),
        gap_m: z.number().min(0).max(60).optional(),
        code: z.string().max(12).optional(),
        category,
        name,
      }),
      execute: async (i) =>
        apply(
          addSection(state.doc, {
            seats: i.seats,
            rows: i.rows,
            width: m(i.width_m),
            side: i.side,
            bearing: i.bearing,
            nextTo: i.next_to,
            direction: i.direction,
            behind: i.behind,
            gap: m(i.gap_m),
            code: i.code,
            category: i.category,
            name: i.name,
          }),
        ),
    }),

    add_floor: tool({
      description: "Seat the field floor (concerts): a grid of blocks with aisles, facing the stage if there is one.",
      inputSchema: z.object({
        seats: z.number().int().min(1).max(60000),
        blocks: z.number().int().min(1).max(60).optional(),
        aisle_m: z.number().min(0.8).max(10).optional(),
        category,
        name,
      }),
      execute: async (i) => apply(addFloor(state.doc, { seats: i.seats, blocks: i.blocks, aisle: m(i.aisle_m), category: i.category, name: i.name })),
    }),

    add_stairs: tool({
      description: "Add stairs in every aisle between neighbouring sections of the selection, front row to back row.",
      inputSchema: z.object({ target }),
      execute: async (i) => apply(addStairs(state.doc, sel(i.target))),
    }),

    add_points: tool({
      description: "Add entrances, exits, kitchens or pickup points spread around the venue (outside everything, or on the concourse behind a ring).",
      inputSchema: z.object({
        kind: z.enum(["entrance", "exit", "kitchen", "pickup"]),
        count: z.number().int().min(1).max(48).optional(),
        bearings: z.array(z.number()).max(48).optional().describe("Exact bearings in degrees clockwise from north, instead of count"),
        start_bearing: z.number().optional(),
        ring: z.number().int().min(1).max(99).optional().describe("Place on the concourse behind this ring"),
        labels: z.array(z.string().max(40)).max(48).optional(),
      }),
      execute: async (i) => apply(addPoints(state.doc, { kind: i.kind, count: i.count, bearings: i.bearings, startBearing: i.start_bearing, ring: i.ring, labels: i.labels })),
    }),

    add_shape: tool({
      description: "Add a stage, area, wall, column or text label. Place with anchor (inside the field edge on that side), or x/y metres from the field centre when nothing else fits.",
      inputSchema: z.object({
        kind: z.enum(["stage", "rect", "ellipse", "wall", "column", "text"]),
        w_m: z.number().min(0.5).max(1000),
        h_m: z.number().min(0.5).max(1000),
        anchor: z.enum(["center", "north", "south", "east", "west"]).optional(),
        x_m: z.number().min(-2000).max(2000).optional(),
        y_m: z.number().min(-2000).max(2000).optional(),
        rotation: z.number().optional(),
        label: z.string().max(60).optional(),
      }),
      execute: async (i) =>
        apply(addShape(state.doc, { kind: i.kind, w: m(i.w_m)!, h: m(i.h_m)!, anchor: i.anchor, x: m(i.x_m), y: m(i.y_m), rotation: i.rotation, label: i.label })),
    }),

    update_sections: tool({
      description:
        "Change sections: category, name prefix, gate (entrance label), seats (exact per section, or a +/- change) or rows. Seats are re-spread evenly; more seats than fit add rows at the back.",
      inputSchema: z.object({
        target,
        category: z.string().max(40).optional(),
        name: z.string().max(40).optional(),
        entrance: z.string().max(40).optional(),
        seats: z.number().int().min(1).max(36000).optional().describe("Seats in each selected section"),
        seats_delta: z.number().int().min(-36000).max(36000).optional().describe("Change per selected section"),
        rows: z.number().int().min(1).max(100).optional().describe("Row count, seats kept unless also given"),
      }),
      execute: async (i) =>
        apply(updateSections(state.doc, sel(i.target), { category: i.category, name: i.name, entrance: i.entrance, seats: i.seats, seatsDelta: i.seats_delta, rows: i.rows })),
    }),

    move_sections: tool({
      description: "Slide sections along the bowl (slide_m, + is clockwise) and/or further from the field (out_m). x/y moves and turns only for sections off the bowl.",
      inputSchema: z.object({
        target,
        slide_m: z.number().min(-2000).max(2000).optional(),
        out_m: z.number().min(-200).max(200).optional(),
        dx_m: z.number().min(-2000).max(2000).optional(),
        dy_m: z.number().min(-2000).max(2000).optional(),
        rotate_deg: z.number().min(-360).max(360).optional(),
      }),
      execute: async (i) => apply(moveSections(state.doc, sel(i.target), { along: m(i.slide_m), out: m(i.out_m), dx: m(i.dx_m), dy: m(i.dy_m), turn: i.rotate_deg })),
    }),

    remove: tool({
      description: "Remove sections (target), points by kind, and/or shapes by kind.",
      inputSchema: z.object({
        target: target.optional(),
        points: z.array(z.enum(["entrance", "exit", "stairs", "kitchen", "pickup", "all"])).max(6).optional(),
        shapes: z.array(z.enum(["stage", "field", "rect", "ellipse", "wall", "column", "venue", "text", "all"])).max(9).optional(),
      }),
      execute: async (i) => apply(removeItems(state.doc, { target: i.target && sel(i.target), points: i.points, shapes: i.shapes })),
    }),

    set_category: tool({
      description: "Create or edit a price category (colour optional, hex), and optionally assign it to sections.",
      inputSchema: z.object({
        name: z.string().min(1).max(40),
        color: z.string().max(7).optional(),
        rename_to: z.string().max(40).optional(),
        assign: target.optional(),
      }),
      execute: async (i) => apply(setCategory(state.doc, { name: i.name, color: i.color, renameTo: i.rename_to, assign: i.assign && sel(i.assign) })),
    }),

    check_map: tool({
      description: "List problems on the map (overlapping sections, rows outside sections, duplicate codes).",
      inputSchema: z.object({}),
      execute: async () => checkMap(state.doc),
    }),
  };
}

export type SeatMapTools = ReturnType<typeof createSeatMapTools>;

export function instructionsFor(doc: SeatMapDoc): string {
  return `You design seat maps for stadiums and arenas by calling tools. The user watches the map update live.

How the map works
- A field sits in the centre with a venue shape (the bowl) around it. All seating stands on the bowl and follows its curve; the tools place it and solve rows and seats, so never work out coordinates or seats per row yourself.
- Say where things go: a whole ring, an arc of bearings (degrees clockwise from north, the top), a side (north/east/south/west), next to a section, or behind one. New tiers stack behind what is already on that stretch.
- Ring 1 is innermost with sections 101, 102…; ring 2 has 201…; section 1 of each ring is centred at the top and numbers run clockwise. Stands use N1, E1, S1, W1….
- Sizes are in metres. Defaults: seat width 0.55 m, row depth 0.8 m, aisles 1.4 m, walkway 4.5 m between tiers.

How to work
- Plan the whole request, then call tools in order: set_field, then rings or stands from the inside out, then single sections, stairs, points and section edits.
- For a new venue on a map that already has content, call clear_map first. The user can undo your whole turn in one step.
- Prefer one add_ring or add_stand with seats, section_seats or pattern over many edits. Use add_section for one-off blocks, update_sections with target.every for "every other section".
- Leave out section counts, rows and sizes the user did not ask for; the builders pick good values. To change an existing ring, use add_ring with replace_ring instead of adding another ring.
- Trust tool results; do not call get_map after every step. If a tool returns "Error:", follow its hint and retry once, or explain the problem.
- If the request is truly ambiguous, ask one short question. Otherwise choose sensible defaults and mention them.
- Finish with 1–3 short sentences of plain text in the user's language: what you built and the key numbers. No markdown, tables or code.

Current map
${describeMap(doc)}`;
}
