import { describe, expect, it } from "vitest";
import { BUILD_STAND_SCRIPT } from "../../../../tests/support/scripted-model";
import { emptySeatMap } from "../schema";
import { createSeatMapTools } from "./tools";

const opts = { toolCallId: "test", messages: [] } as never;

describe("BUILD_STAND_SCRIPT tool sequence", () => {
  it("runs scripted stand build against an empty map", async () => {
    const state = { doc: emptySeatMap() };
    const patches: unknown[] = [];
    const tools = createSeatMapTools(state, async (patch) => {
      patches.push(patch);
    });
    await tools.set_field.execute!({ kind: "football" }, opts);
    for (const call of BUILD_STAND_SCRIPT) {
      const t = tools[call.toolName as keyof typeof tools];
      expect(t).toBeDefined();
      // @ts-expect-error AI SDK tool execute input varies by tool
      const result = (await t.execute!(call.input, opts)) as string;
      expect(result.startsWith("Error:"), `${call.toolName}: ${result}`).toBe(false);
    }
    expect(state.doc.sections.length).toBeGreaterThan(0);
    expect(patches.length).toBeGreaterThanOrEqual(2);
    const check = (await tools.check_map.execute!({}, opts)) as string;
    expect(check).toBeTruthy();
  });
});
