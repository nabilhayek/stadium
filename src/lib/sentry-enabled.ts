/**
 * Sentry stays off during `next dev` unless NEXT_PUBLIC_SENTRY_DEV=1.
 * Deployed builds (and `next start`) still send when a DSN is set.
 */
export function sentryEnabled(dsn: string | undefined): boolean {
  if (!dsn) return false;
  return process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_SENTRY_DEV === "1";
}
