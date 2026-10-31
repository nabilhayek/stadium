import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { auth } from "@/lib/auth";

const WINDOW_MS = 12 * 60 * 60 * 1000;

async function sign(body: string) {
  const { secret } = await auth.$context;
  return createHmac("sha256", secret).update(`live:${body}`).digest("base64url");
}

/**
 * A pass for the kitchen stream, minted while rendering a signed-in desk page.
 * Checking it needs no database, so stream reconnects don't wake a sleeping one.
 * The expiry snaps to 12-hour windows so re-renders keep the same URL and stream.
 */
export async function kitchenStreamToken(stadium: string, userId: string, now = Date.now()) {
  const expires = (Math.floor(now / WINDOW_MS) + 2) * WINDOW_MS;
  const body = `${stadium}.${userId}.${expires.toString(36)}`;
  return `${body}.${await sign(body)}`;
}

export async function verifyKitchenStreamToken(token: string | null, stadium: string, now = Date.now()) {
  const parts = token?.split(".") ?? [];
  if (parts.length !== 4) return false;
  const [slug, userId, expires, mac] = parts;
  if (slug !== stadium || parseInt(expires, 36) < now) return false;
  const expected = Buffer.from(await sign(`${slug}.${userId}.${expires}`));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
