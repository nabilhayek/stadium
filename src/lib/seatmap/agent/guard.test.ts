import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { promptMessages, takeTurn } from "./guard";

describe("takeTurn", () => {
  it("allows turns under the limit", () => {
    const user = `user-${Math.random()}`;
    expect(takeTurn(user).ok).toBe(true);
  });

  it("blocks after too many turns in the window", () => {
    const user = `heavy-${Math.random()}`;
    for (let i = 0; i < 30; i++) expect(takeTurn(user).ok).toBe(true);
    const blocked = takeTurn(user);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfter).toBeGreaterThan(0);
  });
});

describe("promptMessages", () => {
  it("keeps recent user/assistant text and truncates long parts", () => {
    const messages: UIMessage[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      role: i % 2 === 0 ? "user" : "assistant",
      parts: [{ type: "text", text: `line ${i} ${"x".repeat(5000)}` }],
    }));
    const out = promptMessages(messages);
    expect(out.length).toBeLessThanOrEqual(16);
    expect(out.every((m) => m.role === "user" || m.role === "assistant")).toBe(true);
    const text = (out[0].parts[0] as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(4000);
  });

  it("drops tool-only messages without text", () => {
    const messages: UIMessage[] = [
      { id: "1", role: "assistant", parts: [{ type: "tool-invocation", toolInvocation: { toolName: "x", state: "result", toolCallId: "1", result: "" } } as never] },
      { id: "2", role: "user", parts: [{ type: "text", text: "hello" }] },
    ];
    expect(promptMessages(messages)).toHaveLength(1);
  });
});
