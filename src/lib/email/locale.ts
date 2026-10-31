import "server-only";
import { Resend } from "resend";

export type OutboundEmail = {
  to: string;
  subject: string;
  html: string;
  /** `<event>/<id>`. Same key and same body returns the first send; a different body is rejected. */
  idempotencyKey: string;
};

const captured: OutboundEmail[] = [];

/** Emails recorded while tests are running, instead of calling Resend. */
export function takeSentEmails(): OutboundEmail[] {
  return captured.splice(0, captured.length);
}

function fromAddress() {
  return process.env.EMAIL_FROM || "Seat Service <orders@seatize.com>";
}

/** Send one transactional email. Tests and machines without a key record or skip instead of calling Resend. */
export async function sendMail(message: OutboundEmail): Promise<{ ok: true; skipped?: boolean } | { ok: false; error: string }> {
  if (process.env.VITEST === "true" || !process.env.RESEND_API_KEY) {
    if (process.env.VITEST === "true") captured.push(message);
    return { ok: true, skipped: true };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send(
    { from: fromAddress(), to: [message.to], subject: message.subject, html: message.html },
    { idempotencyKey: message.idempotencyKey.slice(0, 256) },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
