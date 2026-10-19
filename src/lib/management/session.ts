import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function kitchenSession() {
  return auth.api.getSession({ headers: await headers() });
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
