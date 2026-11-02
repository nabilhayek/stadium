/** Identity of this build. No database, so a monitor can call it without waking Postgres. */
export function healthBody() {
  const buildId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "local";
  return { ok: true as const, buildId };
}
