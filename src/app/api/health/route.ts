import { connection } from "next/server";
import { healthBody } from "@/lib/health";

/** Liveness only. Do not query Postgres here — a check every minute keeps Neon awake. */
export async function GET() {
  await connection();
  return Response.json(healthBody(), { headers: { "cache-control": "no-store" } });
}
