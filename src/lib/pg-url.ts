const ALIAS_SSLMODE = /([?&])sslmode=(?:prefer|require|verify-ca)(?=&|$)/g;

/**
 * `pg` currently treats sslmode prefer/require/verify-ca as verify-full and warns.
 * Rewrite those aliases so the strict check stays explicit.
 */
export function postgresConnectionString(url: string): string;
export function postgresConnectionString(url: undefined): undefined;
export function postgresConnectionString(url: string | undefined): string | undefined;
export function postgresConnectionString(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(ALIAS_SSLMODE, "$1sslmode=verify-full");
}
