import type { UIMessage } from "ai";

/** Turns per user per window. In memory, so per server instance: a brake, not a quota. */
const WINDOW_MS = 10 * 60_000;
const MAX_TURNS = 30;
const hits = new Map<string, number[]>();

export function takeTurn(userId: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_TURNS) return { ok: false, retryAfter: Math.ceil((recent[0] + WINDOW_MS - now) / 1000) };
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return { ok: true };
}

const MAX_MESSAGES = 16;
const MAX_TEXT = 4000;

/**
 * What the model sees of the conversation: the latest messages as plain text.
 * Earlier tool calls are dropped; the instructions carry the current map instead,
 * which is shorter and always up to date.
 */
export function promptMessages(messages: UIMessage[]): UIMessage[] {
  return messages
    .slice(-MAX_MESSAGES)
    .map((msg) => ({
      id: msg.id,
      role: msg.role,
      parts: msg.parts
        .filter((p) => p.type === "text")
        .map((p) => ({ type: "text" as const, text: (p as { text: string }).text.slice(0, MAX_TEXT) })),
    }))
    .filter((msg) => (msg.role === "user" || msg.role === "assistant") && msg.parts.some((p) => p.text.trim()));
}
