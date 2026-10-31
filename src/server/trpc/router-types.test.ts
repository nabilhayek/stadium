import type { inferRouterOutputs } from "@trpc/server";
import { describe, expectTypeOf, it } from "vitest";
import type { publicReceipt } from "@/lib/orders/shape";
import type { AppRouter } from "./root";

type RouterOut = inferRouterOutputs<AppRouter>;
type PublicShape = ReturnType<typeof publicReceipt>;

describe("AppRouter output types", () => {
  it("orders.get is a public receipt without write secrets", () => {
    expectTypeOf<RouterOut["orders"]["get"]>().toEqualTypeOf<PublicShape | null>();
    expectTypeOf<PublicShape>().not.toHaveProperty("token");
    expectTypeOf<PublicShape>().not.toHaveProperty("deviceId");
    expectTypeOf<PublicShape>().toHaveProperty("confirmCode");
  });

  it("kitchen.update returns ok or a desk error", () => {
    expectTypeOf<RouterOut["kitchen"]["update"]>().toEqualTypeOf<{ ok: true } | { ok: false; error: string }>();
  });
});
