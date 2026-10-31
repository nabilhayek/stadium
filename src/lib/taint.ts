/// <reference types="react/experimental" />
import "server-only";
import * as React from "react";

const SECRETS = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "BETTER_AUTH_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "SENTRY_AUTH_TOKEN",
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
] as const;

// Only the server-component build of React has these; route handlers may load another build.
const taintValue = (React as Partial<typeof React>).experimental_taintUniqueValue;
const taintObject = (React as Partial<typeof React>).experimental_taintObjectReference;

/** Throws during render if a server secret is ever passed to a Client Component. */
export function taintSecrets() {
  if (!taintValue) return;
  for (const name of SECRETS) {
    const value = process.env[name];
    if (value) taintValue(`${name} must not be sent to the browser.`, process, value);
  }
}

/** For records that carry credentials, such as an auth session with its token. */
export function taintRecord<T extends object>(record: T, message: string): T {
  taintObject?.(message, record);
  return record;
}
