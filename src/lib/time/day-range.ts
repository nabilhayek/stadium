/** Midnight-to-midnight in a venue's timezone, as UTC instants. `day` is `YYYY-MM-DD`. */
export function dayRange(day: string, timeZone: string): { start: Date; end: Date } {
  const start = zonedMidnight(day, timeZone);
  const end = zonedMidnight(addDay(day), timeZone);
  return { start, end };
}

function addDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return next.toISOString().slice(0, 10);
}

function zonedMidnight(day: string, timeZone: string): Date {
  const guess = new Date(`${day}T00:00:00.000Z`);
  return new Date(guess.getTime() - offsetAt(guess, timeZone));
}

/** Milliseconds to add to UTC to get the clock in `timeZone` at `instant`. */
function offsetAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = parts.find((part) => part.type === "hour")?.value === "24" ? 0 : pick("hour");
  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), hour, pick("minute"), pick("second"));
  return asUtc - instant.getTime();
}
