import { z } from "zod";
import { CURRENCIES, PERMISSIONS, type AdminSettings, type Member, type Permission, type StaffRole } from "@/components/management/admin/model";

const PERMISSION_IDS: readonly string[] = PERMISSIONS.map((p) => p.id);
const BUILTIN_ROLES = ["admin", "manager", "kitchen", "runner"] as const;

const permissionId = z.string().refine((id) => PERMISSION_IDS.includes(id), "Unknown permission.");

const roleSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200),
  builtin: z.boolean(),
  permissions: z.array(permissionId).max(PERMISSION_IDS.length),
});

const memberSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  email: z.email().max(200),
  role: z.string().min(1).max(40),
  permissions: z.array(permissionId).max(PERMISSION_IDS.length).nullable(),
  kitchens: z.array(z.string().min(1).max(40)).max(40),
  status: z.enum(["active", "invited", "disabled"]),
  lastSeen: z.string().nullable().optional(),
});

const kitchenSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(60),
  x: z.number().finite(),
  y: z.number().finite(),
  open: z.boolean(),
  pickup: z.boolean(),
  delivery: z.boolean(),
  capacity: z.number().int().min(1).max(500),
  prepMinutes: z.number().int().min(1).max(180),
  overflow: z.boolean(),
  overflowTo: z.string().min(1).max(40).nullable(),
  overflowAt: z.number().int().min(1).max(100),
  autoPause: z.boolean(),
});

/** The document stored on VenueAdmin. Members are rows, so they are not in here. */
export const venueSettingsSchema = z.object({
  currency: z.string().trim().toUpperCase(),
  roles: z.array(roleSchema).max(20),
  kitchens: z.array(kitchenSchema).max(40),
  routes: z.record(z.string().max(40), z.string().max(40)),
  ordering: z.object({
    acceptOrders: z.boolean(),
    seatDelivery: z.boolean(),
    deliveryFee: z.boolean(),
    deliveryFeeCents: z.number().int().min(0).max(100_000),
    freeDeliveryOver: z.boolean(),
    freeDeliveryOverCents: z.number().int().min(0).max(1_000_000),
    minimumOrder: z.boolean(),
    minimumOrderCents: z.number().int().min(0).max(1_000_000),
    pickup: z.enum(["all", "some", "off"]),
    serviceFee: z.boolean(),
    serviceFeePercent: z.number().min(0).max(30),
    tips: z.boolean(),
    notes: z.boolean(),
    alcoholLimit: z.boolean(),
    alcoholPerOrder: z.number().int().min(0).max(50),
    ageCheck: z.boolean(),
  }),
  service: z.object({
    preorder: z.boolean(),
    busyMessage: z.string().trim().max(280),
  }),
  payments: z.object({
    card: z.boolean(),
    applePay: z.boolean(),
    googlePay: z.boolean(),
    swish: z.boolean(),
    autoRefundMinutes: z
      .number()
      .int()
      .min(0)
      .max(24 * 60),
  }),
  notifications: z.object({
    sound: z.boolean(),
    slowOrderMinutes: z.number().int().min(1).max(180),
    dailyReport: z.boolean(),
    reportEmail: z.union([z.literal(""), z.email()]),
    lowStock: z.boolean(),
  }),
});

export const adminSaveSchema = venueSettingsSchema.extend({
  members: z.array(memberSchema).max(200),
});

export type VenueSettings = z.output<typeof venueSettingsSchema>;

/**
 * Check the rules the form can break: the four built-in roles stay, Admin keeps
 * every permission, every person points at a real role and kitchen, and there
 * are no two people with the same email.
 */
export function normalizeAdminSettings(
  input: z.output<typeof adminSaveSchema>,
  allowedCurrency: string,
): { ok: true; settings: AdminSettings } | { ok: false; error: string } {
  const currency = input.currency.toUpperCase();
  const known = new Set<string>([...CURRENCIES, allowedCurrency.toUpperCase()]);
  if (!known.has(currency)) return { ok: false, error: "Pick a supported currency." };

  const roles = input.roles.map((role) => (role.id === "admin" ? { ...role, builtin: true, permissions: [...PERMISSION_IDS] } : role));
  for (const id of BUILTIN_ROLES) {
    const role = roles.find((r) => r.id === id);
    if (!role) return { ok: false, error: "The built-in roles can't be removed." };
    if (id === "admin" && !role.builtin) return { ok: false, error: "Admin stays a built-in role." };
  }
  const roleIds = new Set(roles.map((r) => r.id));
  if (roleIds.size !== roles.length) return { ok: false, error: "Two roles have the same id." };

  const kitchenIds = new Set(input.kitchens.map((k) => k.id));
  if (kitchenIds.size !== input.kitchens.length) return { ok: false, error: "Two kitchens have the same id." };
  for (const kitchen of input.kitchens) {
    if (kitchen.overflowTo && !kitchenIds.has(kitchen.overflowTo)) return { ok: false, error: "Overflow points at a kitchen that doesn't exist." };
    if (kitchen.overflowTo === kitchen.id) return { ok: false, error: "A kitchen can't overflow to itself." };
  }
  for (const kitchenId of Object.values(input.routes)) {
    if (!kitchenIds.has(kitchenId)) return { ok: false, error: "A section is routed to a kitchen that doesn't exist." };
  }

  const emails = new Set<string>();
  const members: Member[] = [];
  for (const member of input.members) {
    const email = member.email.trim().toLowerCase();
    if (emails.has(email)) return { ok: false, error: "Two people have the same email." };
    emails.add(email);
    if (!roleIds.has(member.role)) return { ok: false, error: "Someone is on a role that doesn't exist." };
    const admin = member.role === "admin";
    const kitchens = admin ? [] : member.kitchens;
    if (kitchens.some((id) => !kitchenIds.has(id))) return { ok: false, error: "Someone is assigned to a kitchen that doesn't exist." };
    members.push({
      id: member.id,
      name: member.name.trim(),
      email,
      role: member.role,
      permissions: admin ? null : member.permissions,
      kitchens,
      status: member.status,
      lastSeen: null,
    });
  }

  const settings: AdminSettings = {
    currency,
    members,
    roles: roles satisfies StaffRole[],
    kitchens: input.kitchens,
    routes: input.routes,
    ordering: input.ordering,
    service: input.service,
    payments: input.payments,
    notifications: { ...input.notifications, reportEmail: input.notifications.reportEmail.trim().toLowerCase() },
  };
  return { ok: true, settings };
}

/** Shop and checkout only need this one switch. Missing or unreadable settings mean orders are open. */
export function readsAcceptOrders(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return true;
  const ordering = (settings as { ordering?: { acceptOrders?: unknown } }).ordering;
  return ordering?.acceptOrders !== false;
}

/** JSON with sorted keys, so two equal documents compare equal whatever order their keys arrived in. */
function canon(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function omit<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !(keys as readonly PropertyKey[]).includes(key))) as Omit<T, K>;
}

/** The parts of a team row an admin edits. `lastSeen` and `twoFactor` are read-only. */
function teamRow(member: Pick<Member, "id" | "name" | "email" | "role" | "permissions" | "kitchens" | "status">) {
  const { id, name, email, role, permissions, kitchens, status } = member;
  return { id, name, email: email.toLowerCase(), role, permissions, kitchens, status };
}

export type AdminChange = {
  /** Every one of these is needed. */
  permissions: Permission[];
  /** Someone with the Admin role is added, edited, or removed. Only an Admin (or the owner) may do that. */
  touchesAdmins: boolean;
};

/**
 * What a save from Admin needs, judged by what it changes, so each role can do its part of the one document:
 * the team and roles need `team.manage`, opening or pausing kitchens needs `kitchens.pause`, anything else needs
 * `settings.edit`. Nothing changed needs nothing.
 */
export function adminChangePermissions(before: AdminSettings, after: z.output<typeof adminSaveSchema>): AdminChange {
  const needed = new Set<Permission>();
  let touchesAdmins = false;

  const beforeTeam = new Map(before.members.map((m) => [m.id, teamRow(m)]));
  const afterTeam = new Map(after.members.map((m) => [m.id, teamRow(m)]));
  for (const id of new Set([...beforeTeam.keys(), ...afterTeam.keys()])) {
    const was = beforeTeam.get(id);
    const now = afterTeam.get(id);
    if (canon(was) === canon(now)) continue;
    needed.add("team.manage");
    if (was?.role === "admin" || now?.role === "admin") touchesAdmins = true;
  }
  if (canon(before.roles) !== canon(after.roles)) needed.add("team.manage");

  const withoutOpen = (kitchens: AdminSettings["kitchens"]) => kitchens.map((k) => omit(k, ["open"]));
  if (canon(withoutOpen(before.kitchens)) !== canon(withoutOpen(after.kitchens))) needed.add("settings.edit");
  else if (canon(before.kitchens.map((k) => k.open)) !== canon(after.kitchens.map((k) => k.open))) needed.add("kitchens.pause");

  const handled = ["members", "roles", "kitchens"] as const;
  if (canon(omit(before, handled)) !== canon(omit(after, handled))) needed.add("settings.edit");

  return { permissions: [...needed], touchesAdmins };
}
