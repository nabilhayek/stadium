import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeclineDialog } from "./decline-dialog";

describe("DeclineDialog", () => {
  it("requires a reason before declining", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(<DeclineDialog orderNumber="A-TEST" onCancel={vi.fn()} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("radio", { name: /Other/i }));
    const decline = screen.getByRole("button", { name: "Decline" });
    expect(decline).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Tell the customer why"), "Kitchen closed");
    expect(decline).toBeEnabled();
    await user.click(decline);
    expect(onConfirm).toHaveBeenCalledWith("Kitchen closed");
  });
});
