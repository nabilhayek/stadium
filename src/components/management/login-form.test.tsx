import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "../../../tests/support/render";
import { LoginForm } from "./login-form";

const loginMessages = {
  login: {
    name: "Name",
    email: "Email",
    password: "Password",
    pleaseWait: "Please wait",
    createAccount: "Create kitchen account",
    signIn: "Sign in",
    firstTime: "First time here? Create the kitchen account",
    alreadyHave: "Already have an account? Sign in",
    couldNotSignIn: "Could not sign in.",
    forgot: "Forgot password?",
    backToSignIn: "Back to sign in",
  },
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth-client", () => ({
  signIn: { email: vi.fn(async () => ({ error: null })) },
  signUp: { email: vi.fn(async () => ({ error: null })) },
  requestPasswordReset: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/components/toast/toast-provider", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("LoginForm", () => {
  it("requires an 8-character password", () => {
    renderWithIntl(<LoginForm stadiumSlug="arena" canRegister={false} />, loginMessages);
    expect(screen.getByLabelText("Password")).toHaveAttribute("minLength", "8");
  });

  it("shows pending copy while submitting", async () => {
    const { signIn } = await import("@/lib/auth-client");
    vi.mocked(signIn.email).mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100)));

    const user = userEvent.setup();
    renderWithIntl(<LoginForm stadiumSlug="arena" canRegister={false} />, loginMessages);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "chef@arena.test");
    await user.type(screen.getByLabelText("Password"), "password1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("button", { name: "Please wait" })).toBeDisabled();
    // The mock resolves a moment later and clears pending. Wait for that here,
    // or the update lands after jsdom is gone and coverage exits with a rejection.
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});
