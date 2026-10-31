import "server-only";
import { getCache } from "@vercel/functions";

const KEY = "live:version";
/** Long enough to outlive a quiet day; an evicted value only means "nothing new". */
const TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * A change counter kept outside Postgres, so idle servers can watch for new
 * orders without waking a suspended database.
 */
export async function readVersion(): Promise<string | null> {
  try {
    const value = await getCache().get(KEY);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export async function bumpVersion(): Promise<string> {
  const version = Date.now().toString(36);
  await getCache()
    .set(KEY, version, { ttl: TTL_SECONDS, name: "live-version" })
    .catch(() => undefined);
  return version;
}
