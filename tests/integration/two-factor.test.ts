import "../support/server-mocks";
import { afterEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { authPrisma } from "@/lib/auth";
import { withDb } from "@/lib/db";
import { resetTwoFactor, twoFactorRequired } from "@/lib/management/two-factor";
import { getArena } from "../support/factories";
import { clearKitchenSession, kitchenCaller, makeSession } from "../support/caller";

afterEach(() => clearKitchenSession());

/** Sign-up is closed once an account exists, so write users directly. */
async function createKitchenUser(opts: { email: string }) {
  const user = await authPrisma.user.create({
    data: { id: `u-${Math.random().toString(36).slice(2, 12)}`, name: "Person", email: opts.email, emailVerified: true },
  });
  return { user, email: opts.email };
}

async function member(roleId: string, email: string, userId: string | null) {
  const stadium = await getArena();
  return withDb((db) =>
    db.staffMember.create({
      data: { id: `m-${Math.random().toString(36).slice(2, 10)}`, stadiumId: stadium.id, name: "Person", email, roleId, status: "ACTIVE", userId },
    }),
  );
}

async function enableTwoFactor(userId: string) {
  await authPrisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
  await authPrisma.twoFactor.create({ data: { id: `tf-${userId}`, secret: "s", backupCodes: "b", userId } });
}

describe("two-factor policy", () => {
  it("requires it for admins and managers until it is on, not for kitchen staff", async () => {
    const admin = await createKitchenUser({ email: `tf-admin-${Date.now()}@example.com` });
    const cook = await createKitchenUser({ email: `tf-cook-${Date.now()}@example.com` });
    await member("admin", admin.email, admin.user.id);
    await member("kitchen", cook.email, cook.user.id);

    expect(await twoFactorRequired({ id: admin.user.id, email: admin.email, twoFactorEnabled: false })).toBe(true);
    expect(await twoFactorRequired({ id: admin.user.id, email: admin.email, twoFactorEnabled: true })).toBe(false);
    expect(await twoFactorRequired({ id: cook.user.id, email: cook.email, twoFactorEnabled: false })).toBe(false);
  });

  it("blocks desk API calls for a required account that has not set it up", async () => {
    const manager = await createKitchenUser({ email: `tf-mgr-${Date.now()}@example.com` });
    await member("manager", manager.email, manager.user.id);
    const caller = kitchenCaller(makeSession(manager.user.id, manager.email));
    await expect(caller.admin.get({ stadium: "arena" })).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);
  });
});

describe("resetTwoFactor", () => {
  it("lets an admin clear someone's authenticator, sessions and trusted devices, and writes an audit row", async () => {
    const admin = await createKitchenUser({ email: `tf-a2-${Date.now()}@example.com` });
    const target = await createKitchenUser({ email: `tf-t2-${Date.now()}@example.com` });
    await member("admin", admin.email, admin.user.id);
    const row = await member("kitchen", target.email, target.user.id);
    await enableTwoFactor(target.user.id);
    await authPrisma.verification.create({
      data: { id: `v-${target.user.id}`, identifier: "trust-device-abc", value: target.user.id, expiresAt: new Date(Date.now() + 60_000) },
    });

    const result = await resetTwoFactor("arena", row.id, { userId: admin.user.id, email: admin.email });
    expect(result).toEqual({ ok: true });

    const user = await authPrisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect(user.twoFactorEnabled).toBe(false);
    expect(await authPrisma.twoFactor.count({ where: { userId: target.user.id } })).toBe(0);
    expect(await authPrisma.session.count({ where: { userId: target.user.id } })).toBe(0);
    expect(await authPrisma.verification.count({ where: { value: target.user.id, identifier: { startsWith: "trust-device-" } } })).toBe(0);
    const audit = await withDb((db) => db.auditEvent.findFirst({ where: { action: "staff.two_factor_reset", actorEmail: admin.email } }));
    expect(audit).not.toBeNull();
  });

  it("refuses anyone who is not an admin at that stadium", async () => {
    const cook = await createKitchenUser({ email: `tf-c3-${Date.now()}@example.com` });
    const target = await createKitchenUser({ email: `tf-t3-${Date.now()}@example.com` });
    await member("kitchen", cook.email, cook.user.id);
    const row = await member("kitchen", target.email, target.user.id);
    await enableTwoFactor(target.user.id);

    const result = await resetTwoFactor("arena", row.id, { userId: cook.user.id, email: cook.email });
    expect(result.ok).toBe(false);
    const user = await authPrisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect(user.twoFactorEnabled).toBe(true);
  });
});
