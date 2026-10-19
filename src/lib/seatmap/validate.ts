import { distanceToOutline, placeRow, pointInPolygon, seatCount } from "./geometry";
import { MAX_TOTAL_SEATS, SEAT_RADIUS, type SeatMapDoc } from "./schema";

export type SeatMapIssue = {
  level: "error" | "warning";
  message: string;
  /** Selection key of the object to show: `s:<id>` or `r:<id>`. */
  target?: string;
};

/** Errors block publishing; warnings are worth a look but don't. */
export function validateSeatMap(doc: SeatMapDoc): SeatMapIssue[] {
  const issues: SeatMapIssue[] = [];
  const categories = new Set(doc.categories.map((c) => c.id));
  const codes = new Map<string, number>();
  for (const s of doc.sections) codes.set(s.code, (codes.get(s.code) ?? 0) + 1);

  const total = seatCount(doc);
  if (total > MAX_TOTAL_SEATS) {
    issues.push({ level: "error", message: `${total.toLocaleString("en")} seats is over the ${MAX_TOTAL_SEATS.toLocaleString("en")} limit.` });
  }

  const xs = new Float32Array(512);
  const ys = new Float32Array(512);
  const tolerance = SEAT_RADIUS * 1.5;

  for (const s of doc.sections) {
    const target = `s:${s.id}`;
    if ((codes.get(s.code) ?? 0) > 1) issues.push({ level: "error", message: `Section code ${s.code} is used more than once.`, target });
    if (!s.rows.length && s.display !== "block") issues.push({ level: "warning", message: `Section ${s.code} has no seats.`, target });
    if (!s.categoryId) issues.push({ level: "warning", message: `Section ${s.code} has no category.`, target });
    else if (!categories.has(s.categoryId)) issues.push({ level: "error", message: `Section ${s.code} uses a deleted category.`, target });

    const labels = new Set<string>();
    for (const row of s.rows) {
      const rowTarget = `r:${row.id}`;
      if (labels.has(row.label)) {
        issues.push({ level: "error", message: `Section ${s.code} has two rows labelled ${row.label}. Seat ids would clash.`, target: rowTarget });
      }
      labels.add(row.label);

      const n = placeRow(row, xs, ys);
      const probes = n > 2 ? [0, n >> 1, n - 1] : [0, n - 1];
      const outside = probes.some((i) => !pointInPolygon(xs[i], ys[i], s.points) && distanceToOutline(xs[i], ys[i], s.points) > tolerance);
      if (outside) issues.push({ level: "warning", message: `Row ${row.label} in section ${s.code} runs outside the section.`, target: rowTarget });
    }
  }
  return issues;
}
