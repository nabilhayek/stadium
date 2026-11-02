import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma, type StaffStatus } from "@/generated/prisma/client";
import { withDb } from "@/lib/db";
import { revalidateStadiumShop } from "@/lib/revalidate";
import { sendInviteEmail } from "@/lib/email/invite";
import { requestLocale } from "@/lib/email/receipt";
import type { Locale } from "@/i18n/config";
import { emptySeatMap, type SeatMapDoc } from "@/lib/seatmap/schema";
import { getPublishedSeatMap, getSeatMap } from "./seat-map";
import { initialSettings, type AdminSettings, type Member } from "@/components/management/admin/model";
import { adminSaveSchema, readsAcceptOrders, venueSettingsSchema, normalizeAdminSettings, type VenueSettings } from "./admin-settings";

export type AdminResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const STATUS_TO_DB: Record<Member["status"], StaffStatus> = {
  active: "ACTIVE",
  invited: "INVITED",
  disabled: "DISABLED",
};

const STATUS_FROM_DB: Record<StaffStatus, Member["status"]> = {
  ACTIVE: "active",
  INVITED: "invited",
  DISABLED: "disabled",
};

function seenLabel(at: Date | null): string | null {
  if (!at) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(at);
}

function documentOf(settings: AdminSettings): VenueSettings {
  const { members: _members, ...rest } = settings;
  return rest;
}

async function mapFor(slug: string): Promise<SeatMapDoc> {
  const published = await getPublishedSeatMap(slug);
  if (published) return published;
  return (await getSeatMap(slug))?.draft ?? emptySeatMap();
}

function permissionValue(permissions: string[] | null) {
  return permissions === null ? Prisma.DbNull : permissions;
}

/** Saved desk settings, or the defaults for a venue that has never been saved. */
export async function getVenueAdmin(slug: string): Promise<AdminSettings | null> {
  const doc = await mapFor(slug);
  return withDb(async (db) => {
    const stadium = await db.stadium.findUnique({
      where: { slug },
      select: {
        currency: true,
        venueAdmin: { select: { settings: true } },
        staff: {
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, email: true, roleId: true, permissions: true, kitchenIds: true, status: true, lastSeenAt: true },
        },
      },
    });
    if (!stadium) return null;

    const fallback = initialSettings(doc, stadium.currency);
    const parsed = venueSettingsSchema.safeParse(stadium.venueAdmin?.settings);
    const base = parsed.success ? parsed.data : fallback;
    const secured = stadium.staff.length
      ? await db.user.findMany({
          where: { email: { in: stadium.staff.map((row) => row.email), mode: "insensitive" }, twoFactorEnabled: true },
          select: { email: true },
        })
      : [];
    const withTwoFactor = new Set(secured.map((user) => user.email.toLowerCase()));
    const members: Member[] = stadium.staff.map((row) => ({
      twoFactor: withTwoFactor.has(row.email.toLowerCase()),
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.roleId,
      permissions: Array.isArray(row.permissions) ? row.permissions.filter((id): id is string => typeof id === "string") : null,
      kitchens: row.kitchenIds,
      status: STATUS_FROM_DB[row.status],
      lastSeen: seenLabel(row.lastSeenAt),
    }));
    return { ...base, currency: base.currency || stadium.currency, members };
  });
}

/**
 * True unless this stadium exists and an admin has turned ordering off.
 * A missing slug is not a pause. Checkout reports that as a bad basket.
 * Read straight from the database so a pause is not stuck behind the menu cache.
 */
export async function venueAcceptsOrders(slug: string): Promise<boolean> {
  const row = await withDb((db) => db.stadium.findUnique({ where: { slug }, select: { venueAdmin: { select: { settings: true } } } }));
  if (!row) return true;
  return readsAcceptOrders(row.venueAdmin?.settings);
}

export async function saveVenueAdmin(slug: string, input: unknown, locale?: Locale): Promise<AdminResult<{ settings: AdminSettings; invitesSent: number }>> {
  const stadium = await withDb((db) => db.stadium.findUnique({ where: { slug }, select: { id: true, name: true, currency: true } }));
  if (!stadium) return { ok: false, error: "Stadium not found." };

  const parsed = adminSaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const normalized = normalizeAdminSettings(parsed.data, stadium.currency);
  if (!normalized.ok) return normalized;
  const settings = normalized.settings;
  const language = locale ?? (await requestLocale());

  const prior = await withDb((db) => db.staffMember.findMany({ where: { stadiumId: stadium.id }, select: { id: true, email: true, status: true } }));

  const emails = settings.members.map((m) => m.email);
  const users = emails.length
    ? await withDb((db) => db.user.findMany({ where: { email: { in: emails, mode: "insensitive" } }, select: { id: true, email: true } }))
    : [];
  const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user.id]));

  await withDb((db) =>
    db.$transaction(async (tx) => {
      const previous = await tx.staffMember.findMany({ where: { stadiumId: stadium.id }, select: { id: true, lastSeenAt: true } });
      const seen = new Map(previous.map((row) => [row.id, row.lastSeenAt]));

      await tx.venueAdmin.upsert({
        where: { stadiumId: stadium.id },
        create: { stadiumId: stadium.id, settings: documentOf(settings) },
        update: { settings: documentOf(settings) },
      });
      if (settings.currency !== stadium.currency) {
        await tx.stadium.update({ where: { id: stadium.id }, data: { currency: settings.currency } });
      }

      const keep = settings.members.map((m) => m.id);
      await tx.staffMember.deleteMany({ where: { stadiumId: stadium.id, id: { notIn: keep } } });
      for (const member of settings.members) {
        const data = {
          name: member.name,
          email: member.email,
          roleId: member.role,
          permissions: permissionValue(member.permissions),
          kitchenIds: member.kitchens,
          status: STATUS_TO_DB[member.status],
          userId: userByEmail.get(member.email) ?? null,
        };
        await tx.staffMember.upsert({
          where: { id: member.id },
          create: { id: member.id, stadiumId: stadium.id, ...data },
          update: { ...data, lastSeenAt: seen.get(member.id) ?? null },
        });
      }
    }),
  );

  revalidateStadiumShop(slug);
  const saved = await getVenueAdmin(slug);
  if (!saved) return { ok: false, error: "Stadium not found." };

  let invitesSent = 0;
  for (const member of settings.members) {
    if (member.status !== "invited") continue;
    const before = prior.find((row) => row.id === member.id);
    const changed = !before || before.status !== "INVITED" || before.email !== member.email;
    if (!changed) continue;
    const role = settings.roles.find((item) => item.id === member.role)?.label || member.role;
    const sent = await sendInviteEmail({ to: member.email, name: member.name, stadiumName: stadium.name, stadiumSlug: slug, role, locale: language });
    if (!sent.ok) {
      console.error("Invite email failed.");
      continue;
    }
    invitesSent += 1;
    await withDb((db) => db.staffMember.update({ where: { id: member.id }, data: { userId: sent.userId } }));
  }
  return { ok: true, settings: saved, invitesSent };
}

const inviteSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(200),
  role: z.string().min(1).max(40),
  kitchens: z.array(z.string().min(1).max(40)).max(40),
});

/** Create the team row and send the set-password email in this one action. */
export async function inviteStaff(slug: string, input: unknown, locale: Locale): Promise<AdminResult<{ member: Member }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a name, a valid email, and a role." };

  const stadium = await withDb((db) => db.stadium.findUnique({ where: { slug }, select: { id: true, name: true } }));
  if (!stadium) return { ok: false, error: "Stadium not found." };

  const settings = await getVenueAdmin(slug);
  if (!settings) return { ok: false, error: "Stadium not found." };
  const role = settings.roles.find((item) => item.id === parsed.data.role);
  if (!role) return { ok: false, error: "Save this role before sending an invite." };

  const email = parsed.data.email.trim().toLowerCase();
  const kitchens = role.id === "admin" ? [] : parsed.data.kitchens;
  if (kitchens.some((id) => !settings.kitchens.some((kitchen) => kitchen.id === id))) {
    return { ok: false, error: "Save that kitchen before assigning it." };
  }

  const taken = await withDb((db) =>
    db.staffMember.findFirst({ where: { stadiumId: stadium.id, email: { equals: email, mode: "insensitive" } }, select: { id: true } }),
  );
  if (taken) return { ok: false, error: "That email is already on the team." };

  const id = `m-${randomBytes(9).toString("hex")}`;
  const name = parsed.data.name.trim();
  try {
    await withDb((db) =>
      db.staffMember.create({
        data: { id, stadiumId: stadium.id, name, email, roleId: role.id, kitchenIds: kitchens, status: "INVITED" },
      }),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "That email is already on the team." };
    }
    throw error;
  }

  const sent = await sendInviteEmail({ to: email, name, stadiumName: stadium.name, stadiumSlug: slug, role: role.label || role.id, locale });
  if (!sent.ok) {
    await withDb((db) => db.staffMember.delete({ where: { id } })).catch(() => undefined);
    return { ok: false, error: "The invite email did not send." };
  }
  await withDb((db) => db.staffMember.update({ where: { id }, data: { userId: sent.userId } }));

  const member: Member = { id, name, email, role: role.id, permissions: null, kitchens, status: "invited", lastSeen: null };
  return { ok: true, member };
}

/** Send the set-password email again for someone already saved as invited. */
export async function resendStaffInvite(slug: string, memberId: string, locale?: Locale): Promise<AdminResult> {
  const language = locale ?? (await requestLocale());
  const row = await withDb((db) =>
    db.staffMember.findFirst({
      where: { id: memberId, stadium: { slug } },
      select: { name: true, email: true, roleId: true, status: true, stadium: { select: { name: true } } },
    }),
  );
  if (!row) return { ok: false, error: "Save this person first." };
  if (row.status !== "INVITED") return { ok: false, error: "Only invited people get the invite email." };
  const settings = await getVenueAdmin(slug);
  const role = settings?.roles.find((item) => item.id === row.roleId)?.label || row.roleId;
  const sent = await sendInviteEmail({ to: row.email, name: row.name, stadiumName: row.stadium.name, stadiumSlug: slug, role, locale: language });
  if (!sent.ok) return { ok: false, error: "The invite email did not send." };
  return { ok: true };
}
