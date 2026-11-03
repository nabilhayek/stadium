import { vi } from "vitest";
import { createCaller } from "@/server/trpc/root";

vi.mock("@/lib/management/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/management/session")>();
  return {
    ...actual,
    kitchenSession: vi.fn(actual.kitchenSession),
  };
});

import { kitchenSession } from "@/lib/management/session";

type KitchenSession = NonNullable<Awaited<ReturnType<typeof kitchenSession>>>;

const mockedKitchenSession = vi.mocked(kitchenSession);

export function publicCaller() {
  return createCaller({});
}

export function kitchenCaller(session: KitchenSession) {
  mockedKitchenSession.mockResolvedValue(session);
  return createCaller({});
}

export function clearKitchenSession() {
  mockedKitchenSession.mockReset();
  mockedKitchenSession.mockResolvedValue(null);
}

/**
 * A signed-in desk session. Owner by default, so behaviour tests don't need staff rows; pass `{ owner: false }` to
 * exercise the venue and permission guards.
 */
export function makeSession(userId: string, email = "kitchen@example.com", { owner = true }: { owner?: boolean } = {}): KitchenSession {
  return {
    user: {
      id: userId,
      email,
      name: "Kitchen",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
      twoFactorEnabled: false,
      isOwner: owner,
    },
    session: {
      id: `sess-${userId}`,
      userId,
      token: `tok-${userId}`,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    },
  };
}
