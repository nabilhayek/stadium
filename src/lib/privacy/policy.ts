const ANON_DEVICE = "anon";

/** Days to keep seat, email and notes. 0 turns the job off. Unset means one year. */
export function retentionDays(raw = process.env.RECEIPT_RETENTION_DAYS): number {
  if (raw === undefined || raw === "") return 365;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 0 || days > 3650) return 365;
  return days;
}

/** Drops fan details from a receipt or payment draft. Totals and the order number stay. */
export function stripFanDetails(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const next = { ...(body as Record<string, unknown>) };
  delete next.email;
  delete next.token;
  delete next.deviceId;
  next.seat = null;
  next.runnerNote = "";
  if (Array.isArray(next.lines)) {
    next.lines = next.lines.map((line) => {
      if (!line || typeof line !== "object") return line;
      const copy = { ...(line as Record<string, unknown>) };
      delete copy.note;
      return copy;
    });
  }
  return next;
}

export function isAnonymisedDevice(deviceId: string): boolean {
  return deviceId === ANON_DEVICE;
}

export const ANONYMOUS_DEVICE = ANON_DEVICE;
