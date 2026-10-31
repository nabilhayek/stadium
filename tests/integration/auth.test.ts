import "../support/server-mocks";
import { describe, expect, it } from "vitest";
import { auth, authPrisma } from "@/lib/auth";
import { createKitchenUser } from "../support/factories";

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { status?: string | number; statusCode?: number; body?: { message?: string }; message: string };
  }
  throw new Error("Expected the call to reject");
}

describe("kitchen accounts (Better Auth)", () => {
  it("lets the very first sign-up create a desk account", async () => {
    const { user, email } = await createKitchenUser({ email: "owner@example.com", name: "Owner" });

    expect(user.email).toBe(email);
    expect(user.name).toBe("Owner");
    await expect(authPrisma.user.count()).resolves.toBe(1);
    // The password is stored hashed, never in the clear.
    const account = await authPrisma.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.password).toBeTruthy();
    expect(account.password).not.toBe("password123");
  });

  it("forbids a second sign-up: accounts are created by an existing desk", async () => {
    await createKitchenUser({ email: "owner@example.com" });

    const error = await rejection(auth.api.signUpEmail({ body: { email: "intruder@example.com", password: "password123", name: "Intruder" } }));

    expect(error.status).toBe("FORBIDDEN");
    expect(error.body?.message ?? error.message).toContain("Kitchen accounts are created by an existing desk");
    await expect(authPrisma.user.count()).resolves.toBe(1);
  });

  it("the helper itself surfaces the FORBIDDEN on a second user", async () => {
    await createKitchenUser();
    await expect(createKitchenUser({ email: "second@example.com" })).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  it("signs in with the right password and returns a session token", async () => {
    const { email, password, user } = await createKitchenUser();

    const result = await auth.api.signInEmail({ body: { email, password } });

    expect(result.user.id).toBe(user.id);
    expect(result.token).toBeTruthy();
    await expect(authPrisma.session.count({ where: { userId: user.id } })).resolves.toBeGreaterThanOrEqual(1);
  });

  it("rejects a wrong password with UNAUTHORIZED", async () => {
    const { email } = await createKitchenUser();
    const before = await authPrisma.session.count();

    const error = await rejection(auth.api.signInEmail({ body: { email, password: "definitely-wrong" } }));

    expect(error.status).toBe("UNAUTHORIZED");
    await expect(authPrisma.session.count()).resolves.toBe(before);
  });

  it("rejects an unknown email without revealing whether it exists", async () => {
    const { email } = await createKitchenUser();
    const unknown = await rejection(auth.api.signInEmail({ body: { email: "nobody@example.com", password: "password123" } }));
    const wrong = await rejection(auth.api.signInEmail({ body: { email, password: "nope-nope-nope" } }));

    expect(unknown.status).toBe("UNAUTHORIZED");
    expect(unknown.body?.message).toBe(wrong.body?.message);
  });

  it("rejects a too-short password at sign-up", async () => {
    const error = await rejection(auth.api.signUpEmail({ body: { email: "owner@example.com", password: "short", name: "Owner" } }));
    expect(error.status).toBe("BAD_REQUEST");
    await expect(authPrisma.user.count()).resolves.toBe(0);
  });
});
