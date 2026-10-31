import { cacheLife } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
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
