import * as Sentry from "@sentry/nextjs";
import { sentryEnabled } from "@/lib/sentry-enabled";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: sentryEnabled(dsn),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  // Server tracing never touches the fan's phone. Keep a sample in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,
  beforeSend(event) {
    if (event.user) delete event.user.ip_address;
    return event;
  },
});
