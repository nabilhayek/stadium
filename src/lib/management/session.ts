import { cacheLife } from "next/cache";
import { headers } from "next/headers";
import { forbidden, notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import type { Permission } from "@/components/management/admin/model";
import { can, venueAccess } from "@/lib/management/access";
import { taintRecord } from "@/lib/taint";

export async function kitchenSession() {
  // Better Auth checks expiry with `new Date()`. That has to wait for the request, or Cache Components refuses the prerender.
  await connection();
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) taintRecord(session.session, "The auth session holds the sign-in token. Pass only the fields you need.");
  return session;
}

/** Email for the desk chrome. Browser-only cache; the token never enters the cache key. */
export async function kitchenBadge(): Promise<{ email: string } | null> {
  "use cache: private";
  cacheLife("minutes");
  const session = await auth.api.getSession({ headers: await headers() });
  const email = session?.user.email;
  if (!email) return null;
  return { email };
}

/**
 * Layouts and pages render in parallel, so each desk page checks for itself
 * before calling kitchen procedures rather than relying on the layout's redirect.
 */
export async function requireKitchen(stadiumSlug: string) {
  const session = await kitchenSession();
  if (!session) redirect(`/${stadiumSlug}/management/login`);
  return session;
}

/**
 * Page guard for the desk: signed in (else the login page), on this venue's team (else 404, like a venue that
 * doesn't exist), and holding one of `permissions` when given (else 403). The tRPC procedures check the same
 * things again; this keeps people off pages they can't use instead of showing them errors.
 */
export async function requireVenue(stadiumSlug: string, ...permissions: Permission[]) {
  const session = await requireKitchen(stadiumSlug);
  const access = await venueAccess(stadiumSlug, session.user);
  if (!access) notFound();
  if (!can(access, ...permissions)) forbidden();
  return { session, access };
}

/**
 * Route-handler guard, the same checks as {@link requireVenue} answered as JSON instead of pages:
 * 401 signed out, 404 not on this venue's team, 403 missing the permission.
 */
export async function venueRouteAccess(
  stadiumSlug: string,
  ...permissions: Permission[]
): Promise<{ ok: true; session: NonNullable<Awaited<ReturnType<typeof kitchenSession>>> } | { ok: false; response: Response }> {
  const session = await kitchenSession();
  if (!session) return { ok: false, response: Response.json({ error: "Sign in first." }, { status: 401 }) };
  const access = await venueAccess(stadiumSlug, session.user);
  if (!access) return { ok: false, response: Response.json({ error: "Venue not found." }, { status: 404 }) };
  if (!can(access, ...permissions)) return { ok: false, response: Response.json({ error: "Your role doesn't allow this. Ask an admin." }, { status: 403 }) };
  return { ok: true, session };
}
