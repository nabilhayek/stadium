import "server-only";
import { cache } from "react";
import { z } from "zod";
import { withDb } from "@/lib/db";
import { PERMISSIONS, defaultRoles, type Permission } from "@/components/management/admin/model";

/** Who is asking, as far as authorization cares. The Better Auth session user fits. */
export type AccessUser = { id: string; email: string; isOwner?: boolean | null };

/** What one signed-in person may do at one venue. */
export type VenueAccess = {
  stadiumId: string;
  slug: string;
  /** The installation owner: every permission at every venue, without a staff row. */
  owner: boolean;
  /** Their row on Admin → Team. Null for the owner when they aren't on the team list. */
  staffId: string | null;
  roleId: string | null;
  permissions: ReadonlySet<Permission>;
};

const ALL: ReadonlySet<Permission> = new Set(PERMISSIONS.map((p) => p.id));
const KNOWN = ALL as ReadonlySet<string>;

/** Only the roles are read here, leniently: a settings document that fails the full schema still has usable roles. */
const rolesSchema = z.object({ roles: z.array(z.object({ id: z.string(), permissions: z.array(z.string()) })) });

function toPermissions(ids: readonly unknown[]): ReadonlySet<Permission> {
  return new Set(ids.filter((id): id is Permission => typeof id === "string" && KNOWN.has(id)));
}

/**
 * Permissions for a staff row, the same way the Admin screen shows them: Admin always has everything, a personal
 * list overrides the role, otherwise the venue's role (or the built-in one when the venue never saved settings).
 */
export function resolvePermissions(roleId: string, personal: unknown, settings: unknown): ReadonlySet<Permission> {
  if (roleId === "admin") return ALL;
  if (Array.isArray(personal)) return toPermissions(personal);
  const parsed = rolesSchema.safeParse(settings);
  const roles = parsed.success ? parsed.data.roles : defaultRoles();
  return toPermissions(roles.find((role) => role.id === roleId)?.permissions ?? []);
}

async function load(slug: string, userId: string, email: string, isOwner: boolean): Promise<VenueAccess | null> {
  const stadium = await withDb((db) =>
    db.stadium.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        venueAdmin: { select: { settings: true } },
        staff: {
          // Invited people who set a password are still INVITED until they first open the desk (see below).
          where: { status: { not: "DISABLED" }, OR: [{ userId }, { email: { equals: email, mode: "insensitive" } }] },
          select: { id: true, userId: true, roleId: true, permissions: true, status: true },
          take: 1,
        },
      },
    }),
  );
  if (!stadium) return null;

  const row = stadium.staff[0] ?? null;
  if (row && (row.status === "INVITED" || row.userId !== userId)) {
    // First desk visit after accepting an invite: show them as active on the team list and link the sign-in.
    await withDb((db) => db.staffMember.update({ where: { id: row.id }, data: { status: "ACTIVE", userId } })).catch(() => undefined);
  }

  if (isOwner) return { stadiumId: stadium.id, slug: stadium.slug, owner: true, staffId: row?.id ?? null, roleId: row?.roleId ?? null, permissions: ALL };
  if (!row) return null;
  return {
    stadiumId: stadium.id,
    slug: stadium.slug,
    owner: false,
    staffId: row.id,
    roleId: row.roleId,
    permissions: resolvePermissions(row.roleId, row.permissions, stadium.venueAdmin?.settings),
  };
}

/** Per request, so the desk layout, the page and its tRPC calls share one lookup. Keyed on primitives for `cache`. */
const loadOnce = cache(load);

/** Null when the venue doesn't exist or this person isn't on its team (and isn't the owner). */
export function venueAccess(slug: string, user: AccessUser): Promise<VenueAccess | null> {
  return loadOnce(slug, user.id, user.email.toLowerCase(), Boolean(user.isOwner));
}

/** True when `access` has at least one of `permissions` (or no permission is asked for). */
export function can(access: VenueAccess, ...permissions: Permission[]): boolean {
  return permissions.length === 0 || permissions.some((permission) => access.permissions.has(permission));
}
