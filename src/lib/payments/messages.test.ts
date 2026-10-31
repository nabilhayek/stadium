import { describe, expect, it } from "vitest";
import { paymentFailureMessage } from "./messages";

describe("paymentFailureMessage", () => {
  it("maps known decline codes", () => {
    expect(paymentFailureMessage(null, "insufficient_funds")).toMatch(/enough funds/i);
    expect(paymentFailureMessage("expired_card", null)).toMatch(/expired/i);
    expect(paymentFailureMessage("incorrect_cvc", null)).toMatch(/security code/i);
  });

  it("prefers declineCode over code", () => {
    expect(paymentFailureMessage("card_declined", "insufficient_funds")).toMatch(/enough funds/i);
  });

  it("returns generic copy for unknown codes", () => {
    expect(paymentFailureMessage("totally_unknown", null)).toMatch(/haven.t been charged/i);
    expect(paymentFailureMessage(null, null)).toMatch(/haven.t been charged/i);
  });
});
