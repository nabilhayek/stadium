import { cronAuthorized } from "@/lib/cron-auth";
import { runAutoRefunds } from "@/lib/payments/auto-refund";

/**
 * Nightly backstop for Admin → Auto refund. The open orders board applies the wait
 * during service. A check every few minutes would keep Neon awake on days with no orders.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return new Response("cron not configured", { status: 503 });
  if (!cronAuthorized(request)) return new Response("unauthorized", { status: 401 });

  const summary = await runAutoRefunds();
  return Response.json(summary);
}
