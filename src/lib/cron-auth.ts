/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Empty secret means the route stays closed. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
