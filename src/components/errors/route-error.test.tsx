import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as Sentry from "@sentry/nextjs";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "../../../tests/support/render";
import { RouteError } from "./route-error";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

const errorMessages = {
  error: {
    title: "Something went wrong",
    shopBody: "Your cart and orders are safe on this phone. Try again, or reload the page.",
    deskBody: "The board couldn’t load. Orders are safe; try again in a moment.",
    retry: "Try again",
    home: "Back to the menu",
  },
};

describe("RouteError", () => {
  it("reports to Sentry and retries", async () => {
    const err = new Error("boom");
    const retry = vi.fn();
    const user = userEvent.setup();

    renderWithIntl(<RouteError error={err} retry={retry} tone="shop" homeHref="/arena" />, errorMessages);

    expect(Sentry.captureException).toHaveBeenCalledWith(err);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
