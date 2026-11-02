import "server-only";
import { after } from "next/server";

/**
 * Runs `task` once the response has gone out, so a slow push service never delays
 * the kitchen or the payment webhook. Tests await it instead, and code running
 * outside a request (scripts) runs it inline.
 */
export async function later(task: () => Promise<void>): Promise<void> {
  const run = () => task().catch((error: unknown) => console.error("Background task failed.", error));
  if (process.env.VITEST === "true") return run();
  try {
    after(run);
  } catch {
    await run();
  }
}
