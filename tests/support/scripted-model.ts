import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";

type ToolCall = { toolName: string; input: Record<string, unknown> };

const emptyUsage: LanguageModelV3GenerateResult["usage"] = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/** A language model that only emits the scripted tool calls, then finishes. */
export function scriptedSeatMapModel(calls: ToolCall[]) {
  let step = 0;
  return new MockLanguageModelV3({
    doGenerate: async (): Promise<LanguageModelV3GenerateResult> => {
      const call = calls[step++];
      if (!call) {
        return {
          finishReason: { unified: "stop", raw: undefined },
          usage: emptyUsage,
          content: [{ type: "text", text: "Done." }],
          warnings: [],
        };
      }
      return {
        finishReason: { unified: "tool-calls", raw: undefined },
        usage: emptyUsage,
        content: [
          {
            type: "tool-call",
            toolCallId: `call_${step}`,
            toolName: call.toolName,
            input: JSON.stringify(call.input),
          },
        ],
        warnings: [],
      };
    },
    doStream: async () => {
      throw new Error("scriptedSeatMapModel does not stream; drive tools via doGenerate");
    },
  });
}

export const BUILD_STAND_SCRIPT: ToolCall[] = [
  {
    toolName: "add_stand",
    input: { side: "north", seats: 200, sections: 2, rows: 5 },
  },
  { toolName: "check_map", input: {} },
];
